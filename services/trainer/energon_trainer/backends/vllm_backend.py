"""vLLM serving with hot-swappable LoRA adapters (GPU only)."""

from __future__ import annotations

import gc
from pathlib import Path


class VllmBackend:
    def __init__(
        self,
        base_model: str,
        max_model_len: int = 8192,
        gpu_memory_utilization: float = 0.85,
        max_lora_rank: int = 64,
    ) -> None:
        from vllm import LLM

        self.base_model = base_model
        self._options = dict(max_model_len=max_model_len, gpu_memory_utilization=gpu_memory_utilization, max_lora_rank=max_lora_rank)
        self.llm = LLM(model=base_model, enable_lora=True, **self._options)
        self._lora_ids: dict[str, int] = {}

    def chat(self, conversations, *, adapter=None, temperature=0.2, max_tokens=512):
        from vllm import SamplingParams
        from vllm.lora.request import LoRARequest

        lora = None
        if adapter:
            lora_id = self._lora_ids.setdefault(adapter, len(self._lora_ids) + 1)
            lora = LoRARequest(f"adapter-{lora_id}", lora_id, adapter)
        params = SamplingParams(temperature=temperature, max_tokens=max_tokens)
        outputs = self.llm.chat(conversations, params, lora_request=lora, use_tqdm=False)
        return [output.outputs[0].text for output in outputs]

    def train_adapter(self, conversations, output_dir: Path) -> Path:
        from ..lora import train_lora

        # Training needs the GPU memory vLLM holds; release it, train, then reload.
        self.close()
        try:
            return train_lora(self.base_model, conversations, output_dir)
        finally:
            from vllm import LLM

            self.llm = LLM(model=self.base_model, enable_lora=True, **self._options)
            self._lora_ids.clear()

    def close(self) -> None:
        if getattr(self, "llm", None) is None:
            return
        del self.llm
        self.llm = None
        gc.collect()
        try:
            import torch
            from vllm.distributed.parallel_state import destroy_model_parallel

            destroy_model_parallel()
            torch.cuda.empty_cache()
        except Exception:  # pragma: no cover - best effort on GPU hosts
            pass
