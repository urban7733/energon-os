#!/usr/bin/env python3
"""End-to-end check of the nightly training pipeline.

Runs the real energon-api and energon-worker binaries against Postgres
(with pgvector), a local stand-in for RunPod Serverless that launches the
trainer with its fake backend, and verifies the result through the agent API:

  agent reports runs → worker schedules + dispatches → trainer fetches the
  dataset, trains, evaluates, reports → API release gate → GET /training/latest

Usage:  DATABASE_URL=postgres://… python3 tools/e2e-training.py
Needs:  cargo build -p energon-api -p energon-worker, psql, uv (or python3 ≥ 3.11).
The database must be disposable: the script adds an org, agents and runs.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAINER = ROOT / "services" / "trainer"
ADMIN_TOKEN = "e2e-admin-token"
TRAINER_SECRET = "e2e-trainer-secret-0123456789abcdef"
RUN_ID = str(int(time.time()))
ORG = f"org_e2e_{RUN_ID}"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def http(method: str, url: str, body: dict | None = None, headers: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, {"raw": raw.decode(errors="replace")}


def psql(sql: str) -> str:
    result = subprocess.run(
        ["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def trainer_command(args: list[str]) -> list[str]:
    if shutil.which("uv"):
        return ["uv", "run", "--no-project", "--python", "3.12", "python", "-m", "energon_trainer.cli", *args]
    return [sys.executable, "-m", "energon_trainer.cli", *args]


class FakeRunPod:
    """Implements /run, /status and /cancel like RunPod Serverless and runs the trainer locally."""

    def __init__(self, artifacts: Path) -> None:
        self.jobs: dict[str, subprocess.Popen] = {}
        self.logs: dict[str, Path] = {}
        self.artifacts = artifacts
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, body):
                data = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                if self.path.endswith("/run"):
                    return self.reply(outer.start(payload["input"]))
                self.reply({"id": self.path.rsplit("/", 1)[-1], "status": "CANCELLED"})

            def do_GET(self):
                provider_id = self.path.rsplit("/", 1)[-1]
                process = outer.jobs.get(provider_id)
                if process is None:
                    return self.reply({"id": provider_id, "status": "FAILED", "error": "unknown job"})
                if process.poll() is None:
                    return self.reply({"id": provider_id, "status": "IN_PROGRESS"})
                status = "COMPLETED" if process.returncode == 0 else "FAILED"
                self.reply({"id": provider_id, "status": status, "error": outer.logs[provider_id].read_text()[-400:]})

        self.server = ThreadingHTTPServer(("127.0.0.1", free_port()), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/v2"

    def start(self, job: dict) -> dict:
        provider_id = f"rp_{len(self.jobs) + 1}"
        log = self.artifacts / f"{provider_id}.log"
        self.logs[provider_id] = log
        self.jobs[provider_id] = subprocess.Popen(
            trainer_command([
                "job", "--backend", "fake", "--runs", "2",
                "--api-url", job["api_url"], "--job-id", job["job_id"], "--job-token", job["job_token"],
                "--artifacts-dir", str(self.artifacts / "store"),
            ]),
            cwd=TRAINER, stdout=log.open("w"), stderr=subprocess.STDOUT,
            env={**os.environ, "ENERGON_ARTIFACTS_BUCKET": ""},
        )
        return {"id": provider_id, "status": "IN_QUEUE"}


def wait_for(predicate, timeout: float, what: str):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(1)
    raise TimeoutError(f"timed out waiting for {what}")


def check(condition: bool, message: str) -> None:
    print(("  ✓ " if condition else "  ✗ ") + message)
    if not condition:
        raise AssertionError(message)


def main() -> None:
    if not os.environ.get("DATABASE_URL"):
        sys.exit("DATABASE_URL is required")
    binaries = ROOT / "target" / "debug"
    for name in ("energon-api", "energon-worker"):
        if not (binaries / name).exists():
            sys.exit(f"build first: cargo build -p {name}")

    work = Path(tempfile.mkdtemp(prefix="energon-e2e-"))
    runpod = FakeRunPod(work)
    api_port = free_port()
    api_url = f"http://127.0.0.1:{api_port}"
    common = {**os.environ, "RUST_LOG": "info", "ENERGON_TRAINER_SECRET": TRAINER_SECRET}
    processes: list[subprocess.Popen] = []
    try:
        print("1. API")
        processes.append(subprocess.Popen(
            [binaries / "energon-api"],
            env={**common, "ENERGON_BIND_ADDR": f"127.0.0.1:{api_port}", "ENERGON_API_KEY_PEPPER": "e2e-pepper",
                 "ENERGON_ADMIN_TOKEN": ADMIN_TOKEN, "ENERGON_RATE_LIMIT_RPS": "1000", "ENERGON_RATE_LIMIT_BURST": "1000"},
            stdout=(work / "api.log").open("w"), stderr=subprocess.STDOUT,
        ))
        wait_for(lambda: http("GET", f"{api_url}/health")[0] == 200, 60, "the API")
        check(True, "API is up and migrations ran")

        print("2. Agents and runs")
        keys = {}
        for agent in ("research-01", "other-02"):
            status, body = http("POST", f"{api_url}/v1/admin/agents", {"agent_id": f"{agent}-{RUN_ID}", "org_id": ORG},
                                {"x-energon-admin-token": ADMIN_TOKEN})
            check(status == 200 and body.get("api_key", "").startswith("eos_live_"), f"created {agent}")
            keys[agent] = body["api_key"]
        agent_id = f"research-01-{RUN_ID}"
        auth = {"Authorization": f"Bearer {keys['research-01']}"}
        chat = [{"role": "user", "content": "nginx returns 502"},
                {"role": "assistant", "content": "```bash\nsystemctl restart nginx\n```"}]
        for index in range(3):
            status, _ = http("POST", f"{api_url}/v1/runs", {"task": f"restart nginx #{index}", "steps": chat, "outcome": "success"}, auth)
            check(status == 201, f"reported successful run {index + 1}")
        status, body = http("POST", f"{api_url}/v1/runs", {
            "task": "deploy with DEPLOY_TOKEN=supersecretvalue",
            "steps": [{"role": "assistant", "content": "curl -H 'Authorization: Bearer abcdefghijklmnop1234' https://x"}],
            "outcome": "failure",
        }, auth)
        check(status == 201 and body["redactions_applied"] == 2, "secrets in a failed run were redacted (2)")
        http("POST", f"{api_url}/v1/runs", {"task": "other agent's private run", "steps": chat, "outcome": "success"},
             {"Authorization": f"Bearer {keys['other-02']}"})
        _, listed = http("GET", f"{api_url}/v1/runs", headers=auth)
        stored = json.dumps(listed)
        check(len(listed["runs"]) == 4 and "supersecretvalue" not in stored and "abcdefghijklmnop1234" not in stored,
              "agent sees only its own 4 runs, secrets never stored")
        _, latest = http("GET", f"{api_url}/v1/training/latest", headers=auth)
        check(latest == {"version": None}, "no training version before the first night")

        print("3. Enable nightly training (compiled instructions)")
        hour = datetime.now(timezone.utc).hour
        config = {"org_id": ORG, "agent_id": agent_id, "enabled": True, "kind": "compiled",
                  "base_model": "fake-model", "suite": "linux_operator", "min_new_runs": 2,
                  "schedule_hour_utc": hour, "min_lift_pts": 0.0, "updated_at_unix_ms": int(time.time() * 1000)}
        psql(f"INSERT INTO training_configs (org_id, agent_id, enabled, schedule_hour_utc, updated_at_unix_ms, document) "
             f"VALUES ('{ORG}', '{agent_id}', true, {hour}, {config['updated_at_unix_ms']}, '{json.dumps(config)}'::jsonb)")
        check(True, f"config stored for {hour}:00 UTC")

        print("4. Worker → RunPod stand-in → trainer")
        processes.append(subprocess.Popen(
            [binaries / "energon-worker"],
            env={**common, "RUNPOD_API_KEY": "rp-test", "ENERGON_RUNPOD_ENDPOINT_ID": "ep-e2e",
                 "ENERGON_RUNPOD_API_URL": runpod.url, "ENERGON_PUBLIC_API_URL": api_url},
            stdout=(work / "worker.log").open("w"), stderr=subprocess.STDOUT,
        ))

        def finished_job():
            rows = psql(f"SELECT status FROM training_jobs WHERE org_id = '{ORG}' AND agent_id = '{agent_id}' "
                        "AND status IN ('succeeded','failed','rejected') LIMIT 1")
            return rows or None

        job_status = wait_for(finished_job, 300, "the training job")
        if job_status == "failed":
            print(psql(f"SELECT document->>'error' FROM training_jobs WHERE org_id = '{ORG}'"))
        check(job_status in {"succeeded", "rejected"}, f"job finished: {job_status}")
        check(len(runpod.jobs) == 1, "exactly one job dispatched to RunPod")
        _, versions = http("GET", f"{api_url}/v1/training/versions", headers=auth)
        version = versions["versions"][0]
        check(version["kind"] == "compiled" and version["instructions"].startswith("## Learned rules"),
              "version holds compiled rules")
        check(version["eval"]["held_out_tasks"] > 0 and version["eval"]["runs_per_task"] == 2, "held-out eval recorded")
        check(version["trained_on_runs"] == 3, "trained on this agent's 3 successful runs only")
        if job_status == "succeeded":
            _, latest = http("GET", f"{api_url}/v1/training/latest", headers=auth)
            check(latest["version"]["version_id"] == version["version_id"] and latest["version"]["status"] == "live",
                  "agent receives the released version")
        _, other_latest = http("GET", f"{api_url}/v1/training/latest", headers={"Authorization": f"Bearer {keys['other-02']}"})
        check(other_latest == {"version": None}, "another agent never sees this agent's version")

        print("5. Job token boundaries")
        status, _ = http("GET", f"{api_url}/v1/trainer/jobs/does-not-exist/dataset", headers={"Authorization": "Bearer forged.1.00"})
        check(status == 401, "forged job token rejected")

        print("\nEnd-to-end pipeline OK.")
    finally:
        for process in processes:
            process.terminate()
        for process in runpod.jobs.values():
            if process.poll() is None:
                process.terminate()
        runpod.server.shutdown()
        print(f"logs: {work}")


if __name__ == "__main__":
    main()
