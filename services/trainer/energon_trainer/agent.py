"""The shell agent loop, batched: every unfinished episode advances one turn per model call."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .backends import Backend, Conversation
from .sandbox import Sandbox
from .suites import Task

MAX_TURNS = 6
BASH_BLOCK = re.compile(r"```(?:bash|sh|shell)?\s*\n(.*?)```", re.DOTALL)


def extract_command(reply: str) -> str | None:
    match = BASH_BLOCK.search(reply)
    if match and match.group(1).strip():
        return match.group(1).strip()
    return None


@dataclass
class Episode:
    task: Task
    run: int
    messages: Conversation
    sandbox: Sandbox | None = None
    done: bool = False
    success: bool = False
    turns: int = 0
    notes: list[str] = field(default_factory=list)


def run_episodes(
    backend: Backend,
    tasks: list[Task],
    system_prompt: str,
    *,
    runs: int = 1,
    adapter: str | None = None,
    temperature: float = 0.2,
    max_turns: int = MAX_TURNS,
) -> list[Episode]:
    episodes: list[Episode] = []
    for run in range(runs):
        for task in tasks:
            sandbox = Sandbox()
            setup = sandbox.run(task.setup)
            if setup.exit_code != 0:
                sandbox.close()
                raise RuntimeError(f"setup failed for task {task.id}: {setup.output}")
            episodes.append(
                Episode(
                    task=task,
                    run=run,
                    sandbox=sandbox,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Task: {task.prompt}"},
                    ],
                )
            )
    try:
        for _ in range(max_turns):
            active = [episode for episode in episodes if not episode.done]
            if not active:
                break
            replies = backend.chat([episode.messages for episode in active], adapter=adapter, temperature=temperature)
            for episode, reply in zip(active, replies, strict=True):
                episode.turns += 1
                episode.messages.append({"role": "assistant", "content": reply})
                command = extract_command(reply)
                if command is None:
                    episode.done = True
                    continue
                result = episode.sandbox.run(command)
                episode.messages.append({"role": "user", "content": result.observation()})
        for episode in episodes:
            episode.success = episode.sandbox.run(episode.task.check).exit_code == 0
            episode.done = True
    finally:
        for episode in episodes:
            if episode.sandbox is not None:
                episode.sandbox.close()
                episode.sandbox = None
    return episodes
