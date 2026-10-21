"""Rejection sampling: let the model try training tasks and keep what verifiably worked."""

from __future__ import annotations

from .agent import Episode, run_episodes
from .backends import Backend
from .suites import Task

MAX_SUCCESSES_PER_TASK = 2


def collect(
    backend: Backend,
    tasks: list[Task],
    system_prompt: str,
    *,
    attempts: int = 4,
    adapter: str | None = None,
    temperature: float = 0.8,
) -> list[Episode]:
    """Returns all episodes; at most two successes per task are marked for training."""
    episodes = run_episodes(backend, tasks, system_prompt, runs=attempts, adapter=adapter, temperature=temperature)
    kept: dict[str, int] = {}
    for episode in episodes:
        if not episode.success:
            continue
        if kept.get(episode.task.id, 0) >= MAX_SUCCESSES_PER_TASK:
            episode.success = False
            episode.notes.append("duplicate success dropped")
            continue
        kept[episode.task.id] = kept.get(episode.task.id, 0) + 1
    return episodes
