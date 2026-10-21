"""A deterministic stand-in for a GPU model, for tests and local wiring checks.

It knows the suite's reference solutions and "solves" a task with a fixed
probability that rises with learned rules or an adapter. Its numbers say
nothing about real model quality; they only exercise the pipeline.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ..suites import Suite
from . import Conversation

COACH_MARKER = "You are the Energon coach"
RULES_MARKER = "## Learned rules"


class FakeBackend:
    def __init__(self, base_model: str, suite: Suite | None = None, base_skill: float = 0.45) -> None:
        self.base_model = base_model
        self.base_skill = base_skill
        self.solutions = {task.prompt: task.solution for task in (suite.tasks if suite else ())}
        self.calls = 0

    def chat(self, conversations, *, adapter=None, temperature=0.2, max_tokens=512):
        replies = []
        for conversation in conversations:
            self.calls += 1
            replies.append(self._reply(conversation, adapter))
        return replies

    def _reply(self, conversation: Conversation, adapter: str | None) -> str:
        system = conversation[0]["content"] if conversation and conversation[0]["role"] == "system" else ""
        if COACH_MARKER in system:
            return "- Read the file before editing it.\n- Prefer portable flags.\n- Verify the result before replying DONE."
        if any(message["role"] == "assistant" for message in conversation):
            return "DONE"
        task_prompt = conversation[-1]["content"].removeprefix("Task: ")
        skill = self.base_skill + (0.15 if RULES_MARKER in system else 0.0) + (0.25 if adapter else 0.0)
        roll = int(hashlib.sha256(f"{task_prompt}|{self.calls}".encode()).hexdigest(), 16) % 1000 / 1000
        solution = self.solutions.get(task_prompt)
        if solution and roll < skill:
            return f"```bash\n{solution}\n```"
        return "```bash\necho 'not sure how to do this'\n```"

    def train_adapter(self, conversations, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "adapter_config.json").write_text(json.dumps({"fake": True, "base_model": self.base_model}))
        (output_dir / "adapter_model.safetensors").write_bytes(json.dumps(conversations).encode())
        return output_dir

    def close(self) -> None:
        pass
