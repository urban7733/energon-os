# Energon trainer: RunPod Serverless GPU worker.
# vLLM base image (CUDA, PyTorch, vLLM) + Unsloth/TRL for LoRA training.
FROM vllm/vllm-openai:v0.9.2

ENTRYPOINT []
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/runpod-volume/huggingface \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends bubblewrap perl python3-venv \
 && rm -rf /var/lib/apt/lists/*

RUN pip install "unsloth>=2025.6" "trl>=0.19" "peft>=0.15" "datasets>=3.0" "boto3>=1.35" "runpod>=1.7"

WORKDIR /app
COPY pyproject.toml ./
COPY energon_trainer ./energon_trainer
COPY suites ./suites
RUN pip install --no-deps .

# Suites are read from /app/suites (next to the package source).
ENV ENERGON_SUITES_DIR=/app/suites
CMD ["python", "-m", "energon_trainer.handler"]
