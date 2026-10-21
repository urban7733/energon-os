import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from energon_trainer.agent import extract_command, run_episodes
from energon_trainer.api import TrainerApi
from energon_trainer.artifacts import LocalArtifactStore
from energon_trainer.backends.fake import FakeBackend
from energon_trainer.cli import main as cli_main
from energon_trainer.compile import normalise_rules
from energon_trainer.dataset import build_training_set, run_to_conversation
from energon_trainer.pipeline import JobSettings, run_job
from energon_trainer.suites import load_suite

SUITE = load_suite("linux_operator")
TOKEN = "job-token"


def test_extract_command():
    assert extract_command("Let me look.\n```bash\nls -la\n```") == "ls -la"
    assert extract_command("```\npwd\n```") == "pwd"
    assert extract_command("DONE") is None
    assert extract_command("```bash\n\n```") is None


def test_agent_loop_runs_in_isolated_workspaces():
    backend = FakeBackend("m", suite=SUITE, base_skill=1.0)
    episodes = run_episodes(backend, SUITE.held_out[:3], SUITE.system_prompt, runs=2)
    assert len(episodes) == 6
    assert all(episode.success for episode in episodes)
    assert all(episode.sandbox is None for episode in episodes), "sandboxes are cleaned up"
    assert episodes[0].messages[0]["role"] == "system"


def test_runs_become_training_examples_only_in_chat_format():
    good = {
        "task": "restart nginx",
        "outcome": "success",
        "steps": [{"role": "user", "content": "restart nginx"}, {"role": "assistant", "content": "systemctl restart nginx"}],
    }
    assert run_to_conversation(good, "SYS")[0] == {"role": "system", "content": "SYS"}
    assert run_to_conversation({**good, "steps": {"log": "free text"}}, "SYS") is None
    assert run_to_conversation({**good, "steps": [{"role": "user", "content": "x"}]}, "SYS") is None
    failed = {**good, "outcome": "failure"}
    training = build_training_set([good, failed, {**good, "steps": "raw"}], [], "SYS")
    assert (training.from_runs, training.skipped_runs) == (1, 1)


def test_rule_parsing_keeps_general_bullets_only():
    rules = normalise_rules("Here you go:\n- Read files before editing them.\n* Verify the result.\n1. Use portable flags.\nok\n- x")
    assert rules.splitlines() == [
        "## Learned rules",
        "- Read files before editing them.",
        "- Verify the result.",
        "- Use portable flags.",
    ]
    assert normalise_rules("no bullets here") is None


class StubApi:
    """Behaves like the Rust trainer endpoints for one job."""

    def __init__(self, kind: str, live: dict | None = None) -> None:
        self.kind = kind
        self.live = live
        self.heartbeats: list[str] = []
        self.results: list[dict] = []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _reply(self, status, body):
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                    return self._reply(401, {"error": "bad token"})
                self._reply(200, stub.dataset())

            def do_POST(self):
                if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                    return self._reply(401, {"error": "bad token"})
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if self.path.endswith("/heartbeat"):
                    stub.heartbeats.append(body["message"])
                    return self._reply(200, {})
                stub.results.append(body)
                status = "succeeded" if body["status"] == "succeeded" else "failed"
                self._reply(200, {"job": {"status": status}, "version": None})

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def dataset(self):
        return {
            "job": {
                "job_id": "job_1", "org_id": "org_1", "agent_id": "agent_a", "kind": self.kind,
                "base_model": "fake-model", "suite": "linux_operator", "status": "running",
            },
            "config": {"min_lift_pts": 2.0},
            "live_version": self.live,
            "runs": [
                {"task": "restart nginx", "outcome": "success", "steps": [
                    {"role": "user", "content": "restart nginx"},
                    {"role": "assistant", "content": "```bash\nsystemctl restart nginx\n```"},
                ]},
                {"task": "rotate logs", "outcome": "failure", "steps": []},
            ],
        }


@pytest.fixture
def fake_factory():
    return lambda base_model: FakeBackend(base_model, suite=SUITE)


def test_compiled_job_reports_rules_and_held_out_eval(fake_factory):
    stub = StubApi("compiled")
    try:
        run_job(TrainerApi(stub.url, "job_1", TOKEN), fake_factory, None, JobSettings(eval_runs=2, practice_attempts=2))
    finally:
        stub.server.shutdown()
    assert stub.heartbeats[0] == "fetching dataset"
    (result,) = stub.results
    assert result["status"] == "succeeded", result
    payload = result["result"]
    assert payload["instructions"].startswith("## Learned rules")
    assert payload["adapter"] is None
    assert payload["eval"]["held_out_tasks"] == len(SUITE.held_out)
    assert payload["eval"]["previous_success"] is None
    assert 0.0 <= payload["eval"]["candidate_success"] <= 1.0
    assert payload["trained_on_runs"] == 1


def test_adapter_job_uploads_adapter_and_compares_with_live(fake_factory, tmp_path: Path):
    store = LocalArtifactStore(tmp_path / "store")
    previous_dir = tmp_path / "prev"
    FakeBackend("m").train_adapter([], previous_dir)
    previous = store.upload(previous_dir, "org_1/agent_a/job_0.tar.gz")
    live = {"kind": "adapter", "adapter": previous.as_dict(), "instructions": None}
    stub = StubApi("adapter", live)
    try:
        run_job(TrainerApi(stub.url, "job_1", TOKEN), fake_factory, store, JobSettings(eval_runs=2, practice_attempts=2))
    finally:
        stub.server.shutdown()
    (result,) = stub.results
    assert result["status"] == "succeeded", result
    payload = result["result"]
    assert payload["instructions"] is None
    assert payload["adapter"]["uri"] == "s3://local/org_1/agent_a/job_1.tar.gz"
    assert len(payload["adapter"]["sha256"]) == 64
    assert payload["eval"]["previous_success"] is not None
    assert payload["trained_on_runs"] == 1


def test_failures_are_reported_to_the_api(tmp_path: Path):
    stub = StubApi("adapter")
    try:
        with pytest.raises(RuntimeError):
            run_job(TrainerApi(stub.url, "job_1", TOKEN), lambda m: FakeBackend(m, suite=SUITE), None)
    finally:
        stub.server.shutdown()
    assert stub.results[-1]["status"] == "failed"
    assert "artifact store" in stub.results[-1]["error"]


def test_experiment_cli_writes_a_report(tmp_path: Path):
    cli_main(["experiment", "--backend", "fake", "--model", "fake", "--runs", "2", "--attempts", "2", "--out", str(tmp_path)])
    report = json.loads((tmp_path / "report.json").read_text())
    assert "base" in report["variants"]
    assert "trained adapter" in report["variants"]
    assert "Fake backend" in (tmp_path / "report.md").read_text()
