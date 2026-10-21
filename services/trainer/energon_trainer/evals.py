"""Held-out evaluation: success rate per run, mean and spread across runs."""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from .agent import Episode, run_episodes
from .backends import Backend
from .suites import Task


@dataclass
class EvalResult:
    success: float
    spread: float
    per_run: list[float]
    tasks: int
    runs: int
    episodes: list[Episode]

    def per_task(self) -> dict[str, float]:
        totals: dict[str, list[bool]] = {}
        for episode in self.episodes:
            totals.setdefault(episode.task.id, []).append(episode.success)
        return {task_id: sum(results) / len(results) for task_id, results in totals.items()}


def evaluate(
    backend: Backend,
    tasks: list[Task],
    system_prompt: str,
    *,
    runs: int,
    adapter: str | None = None,
    temperature: float = 0.2,
) -> EvalResult:
    if not tasks or runs < 1:
        raise ValueError("evaluation needs tasks and at least one run")
    episodes = run_episodes(backend, tasks, system_prompt, runs=runs, adapter=adapter, temperature=temperature)
    per_run = []
    for run in range(runs):
        results = [episode.success for episode in episodes if episode.run == run]
        per_run.append(sum(results) / len(results))
    return EvalResult(
        success=round(statistics.fmean(per_run), 4),
        spread=round(statistics.pstdev(per_run), 4) if runs > 1 else 0.0,
        per_run=per_run,
        tasks=len(tasks),
        runs=runs,
        episodes=episodes,
    )
