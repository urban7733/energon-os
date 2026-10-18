from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse
from urllib.request import Request

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

    def test_plain_http_is_only_allowed_for_loopback_or_explicit_opt_in(self) -> None:
        with self.assertRaises(ValueError):
            Energon(base_url="http://api.energon.test", api_key="eos_live_test")
        Energon(base_url="http://127.0.0.1:3001", api_key="eos_live_test")
        Energon(base_url="http://localhost:3001", api_key="eos_live_test")
        Energon(base_url="http://[::1]:3001", api_key="eos_live_test")
        Energon(base_url="http://energon-api:3000", api_key="eos_live_test", allow_insecure_http=True)

    def test_redirects_are_refused_so_the_api_key_never_leaves_the_control_plane(self) -> None:
        from energon_sdk.client import _OPENER, _RejectRedirects

        handler = next(h for h in _OPENER.handlers if isinstance(h, _RejectRedirects))
        request = Request("https://api.energon.test/v1/skills", headers={"Authorization": "Bearer x"})
        self.assertIsNone(handler.redirect_request(request, None, 302, "Found", {}, "https://evil.test/"))

    def test_dream_journal_records_pages_and_forgets(self) -> None:
        responses = iter([
            _Response({"memory_id": "dream_1"}),
            _Response({"dreams": [{"memory_id": "dream_1"}], "next_cursor": "5:dream_1"}),
            _Response({"dreams": [{"memory_id": "dream_0"}], "next_cursor": None}),
            _Response({"dream_id": "dream 1/x", "forgotten": True}),
        ])
        with patch("energon_sdk.client.urlopen", side_effect=responses) as urlopen:
            client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
            client.dreams.record(content=" idea ", tags=["growth"], inspired_by=["mem_1", "mem_1"])
            ids = [dream["memory_id"] for dream in client.dreams.iterate(view="private", limit=1)]
            client.dreams.forget("dream 1/x")

        record, first, second, forget = [call.args[0] for call in urlopen.call_args_list]
        self.assertEqual(json.loads(record.data), {"content": "idea", "tags": ["growth"], "inspired_by": ["mem_1"]})
        self.assertEqual(ids, ["dream_1", "dream_0"])
        self.assertEqual(first.full_url, "https://api.energon.test/v1/dreams?limit=1&view=private")
        self.assertIn("cursor=5%3Adream_1", second.full_url)
        self.assertEqual(forget.get_method(), "DELETE")
        self.assertEqual(forget.full_url, "https://api.energon.test/v1/dreams/dream%201%2Fx")

    def test_reflect_cites_context_and_can_decline(self) -> None:
        context = {"context_pack": ["fact"], "items": [{"memory_id": "mem_7"}]}
        responses = iter([_Response(context), _Response({"memory_id": "dream_2"}), _Response(context)])
        with patch("energon_sdk.client.urlopen", side_effect=responses) as urlopen:
            client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
            dream = client.dreams.reflect(task="Reflect", generate=lambda ctx: "A hypothesis")
            declined = client.dreams.reflect(task="Reflect", generate=lambda ctx: None)

        self.assertEqual(dream["memory_id"], "dream_2")
        self.assertIsNone(declined)
        paths = [urlparse(call.args[0].full_url).path for call in urlopen.call_args_list]
        self.assertEqual(paths, ["/v1/context/build", "/v1/dreams", "/v1/context/build"])
        self.assertEqual(json.loads(urlopen.call_args_list[1].args[0].data)["inspired_by"], ["mem_7"])

    def test_dream_sharing_validates_target(self) -> None:
        client = Energon(base_url="https://api.energon.test", api_key="eos_live_test")
        with self.assertRaises(ValueError):
            client.dreams.share(dream_id="d", content="c", target="agent_private", reason="r")


if __name__ == "__main__":
    unittest.main()
