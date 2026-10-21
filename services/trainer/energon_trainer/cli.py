"""energon-train: run the experiment or a single job without RunPod."""

from __future__ import annotations

import argparse
import logging
import os
import tempfile
from pathlib import Path

from . import selfplay
from .api import TrainerApi
from .artifacts import LocalArtifactStore, S3ArtifactStore
from .backends import create_backend
from .compile import compile_instructions
from .dataset import build_training_set
from .evals import evaluate
from .pipeline import JobSettings, run_job
from .report import write_report
from .suites import load_suite

DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"


def backend_for(name: str, model: str, suite_name: str):
    if name == "fake":
        return create_backend("fake", model, suite=load_suite(suite_name))
    return create_backend(name, model)


def experiment(args: argparse.Namespace) -> None:
    suite = load_suite(args.suite)
    backend = backend_for(args.backend, args.model, args.suite)
    try:
        results = {"base": evaluate(backend, suite.held_out, suite.system_prompt, runs=args.runs)}
        practice = selfplay.collect(backend, suite.train, suite.system_prompt, attempts=args.attempts)
        compiled = compile_instructions(
            backend, suite.system_prompt, practice, suite.train, reported_failures=[], previous_rules=None
        )
        if compiled:
            results["compiled instructions"] = evaluate(
                backend, suite.held_out, compiled.system_prompt(suite.system_prompt), runs=args.runs
            )
        if not args.skip_adapter:
            training_set = build_training_set([], practice, suite.system_prompt)
            with tempfile.TemporaryDirectory() as tmp:
                adapter = backend.train_adapter(training_set.conversations, Path(tmp) / "lora")
                results["trained adapter"] = evaluate(
                    backend, suite.held_out, suite.system_prompt, runs=args.runs, adapter=str(adapter)
                )
        meta = {
            "suite": suite.name,
            "base_model": args.model,
            "backend": args.backend,
            "held_out_tasks": len(suite.held_out),
            "runs": args.runs,
            "rules": compiled.rules if compiled else None,
        }
        path = write_report(Path(args.out), meta, results)
        print(path.read_text())
    finally:
        backend.close()


def job(args: argparse.Namespace) -> None:
    api = TrainerApi(args.api_url, args.job_id, args.job_token)
    if os.environ.get("ENERGON_ARTIFACTS_BUCKET"):
        store = S3ArtifactStore()
    else:
        store = LocalArtifactStore(Path(args.artifacts_dir))
    receipt = run_job(
        api,
        lambda model: backend_for(args.backend, model, args.suite),
        store,
        JobSettings(eval_runs=args.runs),
    )
    print(receipt.get("job", {}).get("status"), receipt.get("version", {}) and receipt["version"].get("decision"))


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="energon-train")
    commands = parser.add_subparsers(dest="command", required=True)

    run = commands.add_parser("experiment", help="base vs. compiled instructions vs. adapter on held-out tasks")
    run.add_argument("--suite", default="linux_operator")
    run.add_argument("--model", default=DEFAULT_MODEL)
    run.add_argument("--backend", choices=["vllm", "fake"], default="vllm")
    run.add_argument("--runs", type=int, default=5)
    run.add_argument("--attempts", type=int, default=4)
    run.add_argument("--skip-adapter", action="store_true")
    run.add_argument("--out", default="experiment")
    run.set_defaults(func=experiment)

    single = commands.add_parser("job", help="run one training job against an Energon API")
    single.add_argument("--api-url", required=True)
    single.add_argument("--job-id", required=True)
    single.add_argument("--job-token", required=True)
    single.add_argument("--backend", choices=["vllm", "fake"], default="vllm")
    single.add_argument("--suite", default="linux_operator", help="only used by the fake backend")
    single.add_argument("--runs", type=int, default=5)
    single.add_argument("--artifacts-dir", default="artifacts")
    single.set_defaults(func=job)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
