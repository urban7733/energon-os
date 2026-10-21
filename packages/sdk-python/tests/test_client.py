from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from energon_sdk import Energon, EnergonError  # noqa: E402


class _Response:
    def __init__(self, payload: object) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> bool:
        return False


class EnergonClientTests(unittest.TestCase):
    def test_remember_uses_private_scope_and_agent_authorization(self) -> None:
        with patch("energon_sdk.client.urlopen", return_value=_Response({"memory_id": "mem_1"})) as urlopen:
            client = Energon(base_url="https://api.energon.test/", api_key="eos_live_test")
            memory = client.memory.remember(content=" Private note ", tags=[" priority ", ""])

        request = urlopen.call_args.args[0]
        self.assertEqual(memory["memory_id"], "mem_1")
        self.assertEqual(request.full_url, "https://api.energon.test/v1/memory/write")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Authorization"), "Bearer eos_live_test")
        self.assertEqual(json.loads(request.data), {
            "scope": "agent_private",
            "content": "Private note",
            "tags": ["priority"],
        })

    def test_skill_operations_use_agent_scoped_routes(self) -> None:
        responses = iter([_Response({"skill_id": "skill_1"}), _Response({"skills": []})])
        with patch("energon_sdk.client.urlopen", side_effect=responses) as urlopen:
            client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
            client.skills.create(name="Writer", instructions="Be concise.", allowed_tools=["write"])
            self.assertEqual(client.skills.list(), [])

        create_request, list_request = [call.args[0] for call in urlopen.call_args_list]
        self.assertEqual(create_request.full_url, "https://api.energon.test/v1/skills")
        self.assertEqual(list_request.get_method(), "GET")
        self.assertEqual(json.loads(create_request.data), {
            "name": "Writer",
            "instructions": "Be concise.",
            "allowed_tools": ["write"],
            "requires_approval_for": [],
        })

    def test_operations_overview_uses_the_agent_safe_dashboard_endpoint(self) -> None:
        with patch(
            "energon_sdk.client.urlopen",
            return_value=_Response({"org_id": "org_1", "stats": {"memory": {"total_memories": 4}}}),
        ) as urlopen:
            client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
            overview = client.operations.overview()

        request = urlopen.call_args.args[0]
        self.assertEqual(overview["stats"]["memory"]["total_memories"], 4)
        self.assertEqual(request.full_url, "https://api.energon.test/v1/agent/overview")
        self.assertEqual(request.get_method(), "GET")

    def test_invalid_configuration_never_sends_a_request(self) -> None:
        with self.assertRaises(ValueError):
            Energon(base_url="ftp://api.energon.test", api_key="eos_live_test")
        with self.assertRaises(ValueError):
            Energon(base_url="https://api.energon.test", api_key=" ")


    def test_runs_report_and_validate_outcome(self) -> None:
        receipt = {"run_id": "run_1", "outcome": "success", "redactions_applied": 0, "created_at_unix_ms": 1}
        with patch("energon_sdk.client.urlopen", return_value=_Response(receipt)) as urlopen:
            client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
            result = client.runs.report(
                task=" restart nginx ",
                steps=[{"role": "assistant", "content": "systemctl restart nginx"}],
                outcome="success",
            )
        request = urlopen.call_args.args[0]
        self.assertEqual(result["run_id"], "run_1")
        self.assertEqual(request.full_url, "https://api.energon.test/v1/runs")
        self.assertEqual(json.loads(request.data), {
            "task": "restart nginx",
            "steps": [{"role": "assistant", "content": "systemctl restart nginx"}],
            "outcome": "success",
        })
        with self.assertRaises(ValueError):
            client.runs.report(task="x", steps=[], outcome="maybe")

    def test_training_system_prompt_appends_live_compiled_rules(self) -> None:
        compiled = {"version": {"kind": "compiled", "instructions": "## Learned rules\n- Verify first."}}
        responses = iter([_Response(compiled), _Response({"version": None})])
        with patch("energon_sdk.client.urlopen", side_effect=responses):
            client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
            self.assertEqual(
                client.training.system_prompt("You are an operator."),
                "You are an operator.\n\n## Learned rules\n- Verify first.",
            )
            self.assertIsNone(client.training.latest())


if __name__ == "__main__":
    unittest.main()
