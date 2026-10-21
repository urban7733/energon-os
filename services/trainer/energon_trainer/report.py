"""Experiment report: the number that decides the pivot."""

from __future__ import annotations

import json
from pathlib import Path

from .evals import EvalResult


def write_report(directory: Path, meta: dict, results: dict[str, EvalResult]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    base = results["base"].success
    rows = {
        name: {
            "success": result.success,
            "spread": result.spread,
            "per_run": result.per_run,
            "lift_pts": round((result.success - base) * 100, 2),
            "per_task": result.per_task(),
        }
        for name, result in results.items()
    }
    (directory / "report.json").write_text(json.dumps({**meta, "variants": rows}, indent=2))
    lines = [
        f"# Energon experiment: {meta['suite']}",
        "",
        f"Model `{meta['base_model']}` · backend `{meta['backend']}` · {meta['held_out_tasks']} held-out tasks × {meta['runs']} runs",
        "",
        "| Variant | Success | Spread | Lift vs. base |",
        "|---|---:|---:|---:|",
    ]
    for name, row in rows.items():
        lines.append(f"| {name} | {row['success'] * 100:.1f}% | ±{row['spread'] * 100:.1f} pts | {row['lift_pts']:+.1f} pts |")
    if meta["backend"] == "fake":
        lines += ["", "> Fake backend: these numbers only exercise the pipeline and say nothing about model quality."]
    if meta.get("rules"):
        lines += ["", "## Compiled rules", "", meta["rules"]]
    path = directory / "report.md"
    path.write_text("\n".join(lines) + "\n")
    return path
