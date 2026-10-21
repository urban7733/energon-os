"""A throwaway workspace per attempt.

Each attempt gets a fresh temporary directory. Commands run with that
directory as working directory, a minimal environment and a timeout. On
Linux with bubblewrap available, commands additionally run in a namespace
sandbox with a read-only system, no network and only the workspace writable.
The trainer container itself is disposable, which is the outer boundary.
"""

from __future__ import annotations

import functools
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("energon_trainer")

COMMAND_TIMEOUT_S = 20
MAX_OUTPUT_CHARS = 2_000
SAFE_ENV = {
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
}


@dataclass
class CommandResult:
    exit_code: int
    output: str
    timed_out: bool = False

    def observation(self) -> str:
        status = "timed out" if self.timed_out else f"exit code {self.exit_code}"
        text = self.output if len(self.output) <= MAX_OUTPUT_CHARS else self.output[:MAX_OUTPUT_CHARS] + "\n…[truncated]"
        return f"[{status}]\n{text}".rstrip()


@functools.cache
def bwrap_available() -> bool:
    """bubblewrap needs user namespaces; many containers forbid them. Probe once."""
    if shutil.which("bwrap") is None:
        return False
    try:
        probe = subprocess.run(
            ["bwrap", "--ro-bind", "/", "/", "--unshare-all", "--die-with-parent", "true"],
            capture_output=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    if probe.returncode != 0:
        log.warning("bubblewrap is installed but not permitted here; using plain workspaces")
    return probe.returncode == 0


class Sandbox:
    def __init__(self, use_bwrap: bool | None = None) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="energon-task-"))
        self.use_bwrap = bwrap_available() if use_bwrap is None else use_bwrap

    def __enter__(self) -> "Sandbox":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def close(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def run(self, script: str, timeout: int = COMMAND_TIMEOUT_S) -> CommandResult:
        if not script.strip():
            return CommandResult(0, "")
        env = {**SAFE_ENV, "HOME": str(self.root), "TMPDIR": str(self.root)}
        command = self._wrap(["bash", "-c", script])
        try:
            completed = subprocess.run(
                command,
                cwd=self.root,
                env=env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as expired:
            output = (expired.stdout or "") + (expired.stderr or "")
            if isinstance(output, bytes):
                output = output.decode(errors="replace")
            return CommandResult(124, output, timed_out=True)
        return CommandResult(completed.returncode, completed.stdout + completed.stderr)

    def _wrap(self, command: list[str]) -> list[str]:
        if not self.use_bwrap:
            return command
        binds: list[str] = []
        for path in ("/usr", "/bin", "/lib", "/lib64", "/etc", "/sbin"):
            if os.path.exists(path):
                binds += ["--ro-bind", path, path]
        return [
            "bwrap",
            *binds,
            "--bind", str(self.root), str(self.root),
            "--chdir", str(self.root),
            "--proc", "/proc",
            "--dev", "/dev",
            "--tmpfs", "/tmp",
            "--unshare-all",
            "--die-with-parent",
            *command,
        ]
