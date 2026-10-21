"""Eval suites: checkable tasks with a deterministic train / held-out split."""

from __future__ import annotations

import hashlib
import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

SUITES_DIR = Path(os.environ.get("ENERGON_SUITES_DIR", Path(__file__).resolve().parent.parent / "suites"))
HELD_OUT_SHARE = 0.4


@dataclass(frozen=True)
class Task:
    id: str
    prompt: str
    setup: str
    check: str
    solution: str

    @property
    def held_out(self) -> bool:
        """Stable assignment by task id: held-out tasks never feed training."""
        bucket = int(hashlib.sha256(self.id.encode()).hexdigest(), 16) % 100
        return bucket < HELD_OUT_SHARE * 100


@dataclass(frozen=True)
class Suite:
    name: str
    description: str
    system_prompt: str
    tasks: tuple[Task, ...]

    @property
    def train(self) -> list[Task]:
        return [task for task in self.tasks if not task.held_out]

    @property
    def held_out(self) -> list[Task]:
        return [task for task in self.tasks if task.held_out]


def load_suite(name: str, directory: Path = SUITES_DIR) -> Suite:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"invalid suite name: {name!r}")
    path = directory / f"{name}.toml"
    if not path.is_file():
        raise FileNotFoundError(f"unknown eval suite: {name}")
    raw = tomllib.loads(path.read_text())
    tasks = tuple(
        Task(
            id=item["id"],
            prompt=item["prompt"],
            setup=item.get("setup", ""),
            check=item["check"],
            solution=item["solution"],
        )
        for item in raw["tasks"]
    )
    ids = [task.id for task in tasks]
    if len(ids) != len(set(ids)):
        raise ValueError(f"duplicate task ids in suite {name}")
    return Suite(
        name=raw["name"],
        description=raw.get("description", ""),
        system_prompt=raw["system_prompt"],
        tasks=tasks,
    )
