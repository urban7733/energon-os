"""Turn reported runs and self-play episodes into chat training examples."""

from __future__ import annotations

from dataclasses import dataclass

from .agent import Episode
from .backends import Conversation

ROLES = {"system", "user", "assistant", "tool"}
MAX_EXAMPLE_CHARS = 24_000


@dataclass
class TrainingSet:
    conversations: list[Conversation]
    from_runs: int
    from_selfplay: int
    skipped_runs: int


def run_to_conversation(run: dict, system_prompt: str) -> Conversation | None:
    """Accepts runs whose steps are chat messages (OpenAI format). Others are skipped:
    free-form logs are not safe to imitate token by token."""
    steps = run.get("steps")
    if not isinstance(steps, list) or not steps:
        return None
    messages: Conversation = []
    for step in steps:
        if not isinstance(step, dict):
            return None
        role, content = step.get("role"), step.get("content")
        if role not in ROLES or not isinstance(content, str):
            return None
        messages.append({"role": "user" if role == "tool" else role, "content": content})
    if not any(message["role"] == "assistant" for message in messages):
        return None
    if messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})
    if not any(message["role"] == "user" for message in messages):
        messages.insert(1, {"role": "user", "content": f"Task: {run.get('task', '')}"})
    if sum(len(message["content"]) for message in messages) > MAX_EXAMPLE_CHARS:
        return None
    return messages


def build_training_set(runs: list[dict], episodes: list[Episode], system_prompt: str) -> TrainingSet:
    conversations: list[Conversation] = []
    from_runs = skipped = 0
    for run in runs:
        if run.get("outcome") != "success":
            continue
        conversation = run_to_conversation(run, system_prompt)
        if conversation is None:
            skipped += 1
            continue
        conversations.append(conversation)
        from_runs += 1
    from_selfplay = 0
    for episode in episodes:
        if episode.success:
            conversations.append(episode.messages)
            from_selfplay += 1
    return TrainingSet(conversations, from_runs, from_selfplay, skipped)
