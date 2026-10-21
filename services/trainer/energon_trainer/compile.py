"""Compile instructions: propose rule sets from real failures, keep the one that wins.

Candidates are scored on training tasks only. The held-out tasks stay unseen
until the final evaluation, so the gate measures generalisation.
"""

from __future__ import annotations

from dataclasses import dataclass

from .agent import Episode
from .backends import Backend, Conversation
from .evals import evaluate
from .suites import Task

RULES_HEADER = "## Learned rules"
MAX_RULES = 10
MAX_TRANSCRIPT_CHARS = 1_500
COACH_SYSTEM = (
    "You are the Energon coach. You study an AI agent's work and write short, concrete operating "
    "rules that would have prevented its failures. Rules must be general, not task-specific answers. "
    "Reply only with a markdown bullet list of at most 10 rules."
)


@dataclass
class CompiledInstructions:
    rules: str
    validation_success: float
    candidates_tried: int

    def system_prompt(self, base_system_prompt: str) -> str:
        return with_rules(base_system_prompt, self.rules)


def with_rules(base_system_prompt: str, rules: str | None) -> str:
    return f"{base_system_prompt}\n\n{rules}" if rules else base_system_prompt


def normalise_rules(text: str) -> str | None:
    rules = []
    for line in text.splitlines():
        line = line.strip()
        if line[:1] in {"-", "*", "•"}:
            rule = line[1:].strip()
        elif line[:2].rstrip(".)").isdigit():
            rule = line.split(" ", 1)[-1].strip()
        else:
            continue
        if 8 <= len(rule) <= 300 and "```" not in rule:
            rules.append(f"- {rule}")
    if not rules:
        return None
    return RULES_HEADER + "\n" + "\n".join(rules[:MAX_RULES])


def transcript(episode: Episode) -> str:
    lines = [f"TASK: {episode.task.prompt}", f"RESULT: {'success' if episode.success else 'failure'}"]
    for message in episode.messages[2:]:
        lines.append(f"{message['role'].upper()}: {message['content']}")
    text = "\n".join(lines)
    return text if len(text) <= MAX_TRANSCRIPT_CHARS else text[:MAX_TRANSCRIPT_CHARS] + "\n…"


def coach_conversation(failures: list[Episode], successes: list[Episode], reported: list[str], previous: str | None) -> Conversation:
    parts = []
    if previous:
        parts.append("Current rules:\n" + previous)
    if failures:
        parts.append("Failed attempts:\n\n" + "\n\n".join(transcript(e) for e in failures[:8]))
    if successes:
        parts.append("Successful attempts:\n\n" + "\n\n".join(transcript(e) for e in successes[:4]))
    if reported:
        parts.append("Tasks from production runs that failed:\n" + "\n".join(f"- {task}" for task in reported[:20]))
    parts.append("Write the improved rules now.")
    return [{"role": "system", "content": COACH_SYSTEM}, {"role": "user", "content": "\n\n".join(parts)}]


def compile_instructions(
    backend: Backend,
    system_prompt: str,
    practice: list[Episode],
    validation_tasks: list[Task],
    *,
    reported_failures: list[str],
    previous_rules: str | None,
    candidates: int = 4,
    runs: int = 2,
) -> CompiledInstructions | None:
    failures = [episode for episode in practice if not episode.success]
    successes = [episode for episode in practice if episode.success]
    coach = coach_conversation(failures, successes, reported_failures, previous_rules)
    proposals = backend.chat([coach] * candidates, temperature=0.9, max_tokens=700)
    unique = list(dict.fromkeys(rules for rules in map(normalise_rules, proposals) if rules))
    if not unique:
        return None

    baseline = evaluate(backend, validation_tasks, with_rules(system_prompt, previous_rules), runs=runs).success
    best: CompiledInstructions | None = None
    for rules in unique:
        score = evaluate(backend, validation_tasks, with_rules(system_prompt, rules), runs=runs).success
        if score > baseline and (best is None or score > best.validation_success):
            best = CompiledInstructions(rules, score, len(unique))
    return best
