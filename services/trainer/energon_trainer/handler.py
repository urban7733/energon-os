"""RunPod Serverless entry point. The worker dispatches jobs here."""

from __future__ import annotations

import logging
import os

from .api import TrainerApi
from .artifacts import S3ArtifactStore
from .backends import create_backend
from .pipeline import JobSettings, run_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
REQUIRED = ("job_id", "api_url", "job_token")


def handle(event: dict) -> dict:
    payload = event.get("input") or {}
    missing = [field for field in REQUIRED if not payload.get(field)]
    if missing:
        return {"error": f"missing input fields: {', '.join(missing)}"}
    api = TrainerApi(payload["api_url"], payload["job_id"], payload["job_token"])
    store = S3ArtifactStore() if os.environ.get("ENERGON_ARTIFACTS_BUCKET") else None
    settings = JobSettings(eval_runs=int(os.environ.get("ENERGON_EVAL_RUNS", "5")))
    receipt = run_job(api, lambda base_model: create_backend("vllm", base_model), store, settings)
    return {"job_id": payload["job_id"], "status": receipt.get("job", {}).get("status", "failed")}


if __name__ == "__main__":
    import runpod

    runpod.serverless.start({"handler": handle})
