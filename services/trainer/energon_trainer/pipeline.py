"""One nightly training job, start to finish.

1. Fetch the dataset (this agent's redacted runs, config, live version).
2. Measure base and current live version on held-out tasks.
3. Practice on training tasks (self-play) and learn:
   - compiled: search rules that beat the current ones on training tasks;
   - adapter: fine-tune a LoRA adapter on verified successes.
4. Measure the candidate on the same held-out tasks.
5. Report. The API applies the release gate.
"""

from __future__ import annotations

import logging
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from . import selfplay
from .api import TrainerApi
from .artifacts import StoredArtifact
from .backends import Backend
from .compile import compile_instructions, with_rules
from .dataset import build_training_set
from .evals import evaluate
from .suites import load_suite

log = logging.getLogger("energon_trainer")


class ArtifactStore(Protocol):
    def upload(self, directory: Path, key: str) -> StoredArtifact: ...
    def download(self, uri: str, destination: Path, expected_sha256: str) -> Path: ...


@dataclass
class JobSettings:
    eval_runs: int = 5
    practice_attempts: int = 4
    compile_candidates: int = 4
    compile_validation_runs: int = 2


def run_job(
    api: TrainerApi,
    backend_factory: Callable[[str], Backend],
    store: ArtifactStore | None,
    settings: JobSettings | None = None,
) -> dict:
    settings = settings or JobSettings()
    backend: Backend | None = None
    try:
        api.heartbeat("fetching dataset")
        dataset = api.dataset()
        job = dataset["job"]
        live = dataset.get("live_version")
        runs = dataset.get("runs", [])
        suite = load_suite(job["suite"])
        kind = job["kind"]
        log.info("job %s: %s training for %s on %d runs", job["job_id"], kind, job["agent_id"], len(runs))

        with tempfile.TemporaryDirectory(prefix="energon-job-") as workdir:
            work = Path(workdir)
            previous_rules = live.get("instructions") if live and live.get("kind") == "compiled" else None
            previous_adapter = None
            if live and live.get("kind") == "adapter" and live.get("adapter"):
                if store is None:
                    raise RuntimeError("the live version is an adapter but no artifact store is configured")
                previous_adapter = str(store.download(live["adapter"]["uri"], work, live["adapter"]["sha256"]))

            backend = backend_factory(job["base_model"])
            held_out = suite.held_out

            api.heartbeat("evaluating base and live version")
            base = evaluate(backend, held_out, suite.system_prompt, runs=settings.eval_runs)
            previous = None
            if live:
                previous = evaluate(
                    backend,
                    held_out,
                    with_rules(suite.system_prompt, previous_rules),
                    runs=settings.eval_runs,
                    adapter=previous_adapter,
                )

            api.heartbeat("practicing on training tasks")
            practice = selfplay.collect(
                backend,
                suite.train,
                with_rules(suite.system_prompt, previous_rules),
                attempts=settings.practice_attempts,
                adapter=previous_adapter,
            )

            instructions = None
            adapter_artifact = None
            if kind == "compiled":
                api.heartbeat("compiling instructions")
                reported_failures = [run["task"] for run in runs if run.get("outcome") == "failure"]
                compiled = compile_instructions(
                    backend,
                    suite.system_prompt,
                    practice,
                    suite.train,
                    reported_failures=reported_failures,
                    previous_rules=previous_rules,
                    candidates=settings.compile_candidates,
                    runs=settings.compile_validation_runs,
                )
                if compiled is None:
                    return _fail(api, "no candidate rule set beat the current instructions on training tasks")
                instructions = compiled.rules
                candidate = evaluate(backend, held_out, compiled.system_prompt(suite.system_prompt), runs=settings.eval_runs)
                trained_on = sum(1 for run in runs if run.get("outcome") == "success")
            else:
                if store is None:
                    raise RuntimeError("adapter training needs an artifact store")
                training_set = build_training_set(runs, practice, suite.system_prompt)
                if not training_set.conversations:
                    return _fail(api, "no verified successes to train an adapter on")
                api.heartbeat(f"training adapter on {len(training_set.conversations)} examples")
                adapter_dir = backend.train_adapter(training_set.conversations, work / "lora")
                api.heartbeat("evaluating adapter")
                candidate = evaluate(backend, held_out, suite.system_prompt, runs=settings.eval_runs, adapter=str(adapter_dir))
                key = f"{job['org_id']}/{job['agent_id']}/{job['job_id']}.tar.gz"
                adapter_artifact = store.upload(adapter_dir, key).as_dict()
                trained_on = training_set.from_runs

            result = {
                "instructions": instructions,
                "adapter": adapter_artifact,
                "trained_on_runs": trained_on,
                "eval": {
                    "suite": suite.name,
                    "held_out_tasks": len(held_out),
                    "runs_per_task": settings.eval_runs,
                    "base_success": base.success,
                    "previous_success": previous.success if previous else None,
                    "candidate_success": candidate.success,
                    "candidate_spread": candidate.spread,
                },
            }
            receipt = api.succeed(result)
            log.info("job %s finished: %s", job["job_id"], receipt.get("job", {}).get("status"))
            return receipt
    except Exception as error:  # report, then let the platform see the failure
        log.exception("training job failed")
        try:
            api.fail(f"{type(error).__name__}: {error}")
        except Exception:
            log.exception("could not report the failure")
        raise
    finally:
        if backend is not None:
            backend.close()


def _fail(api: TrainerApi, reason: str) -> dict:
    log.warning(reason)
    return api.fail(reason)
