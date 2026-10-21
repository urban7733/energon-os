"""Model backends. Every backend speaks chat in batches and can train a LoRA adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

Message = dict[str, str]
Conversation = list[Message]


class Backend(Protocol):
    base_model: str

    def chat(
        self,
        conversations: list[Conversation],
        *,
        adapter: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 512,
    ) -> list[str]: ...

    def train_adapter(self, conversations: list[Conversation], output_dir: Path) -> Path: ...

    def close(self) -> None: ...


def create_backend(name: str, base_model: str, **options) -> Backend:
    if name == "fake":
        from .fake import FakeBackend

        return FakeBackend(base_model, **options)
    if name == "vllm":
        from .vllm_backend import VllmBackend

        return VllmBackend(base_model, **options)
    raise ValueError(f"unknown backend: {name}")
