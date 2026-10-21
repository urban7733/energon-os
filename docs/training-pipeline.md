# Nightly training pipeline

Agents report what they did during the day. At night Energon trains a new
version of each enabled agent, measures it on tasks it has never trained on,
and releases it only if it beats the version that is live today.

```
Agent ──POST /v1/runs──▶ API: redact secrets → agent_runs (private to the agent)
Worker scheduler (configured UTC hour, ≥ N new successful runs) ──▶ training_jobs
Worker dispatcher ──RunPod Serverless /run──▶ trainer container (GPU)
Trainer ──GET dataset (job token)──▶ API: this agent's runs, config, live version
Trainer: evaluate base + live → practice (self-play) → learn → evaluate candidate
Trainer ──adapter upload──▶ R2           ──POST result──▶ API
API release gate: lift ≥ max(min_lift_pts, run-to-run spread) and ≥ base → live | rejected
Agent ──GET /v1/training/latest──▶ compiled rules or a presigned adapter link
```

## Two ways to learn

| Kind | For | What the agent gets |
|---|---|---|
| `compiled` | any model, including Claude, GPT, Gemini | `instructions`: a `## Learned rules` block to append to the system prompt (`energon.training.systemPrompt(base)`) |
| `adapter` | open-weight models served with vLLM | `adapter_download_url`: a 15-minute link to a LoRA adapter (`.tar.gz`, `adapter/` inside) for `vllm --enable-lora` |

**Compiled:** the model practices on the suite's *training* tasks, a coach
prompt turns failures and successes into candidate rule sets, and the best
candidate on training tasks is kept. Held-out tasks are only used for the
final measurement.

**Adapter:** verified successes from self-play plus reported successful runs in
chat format (`[{role, content}, …]`) are used for a LoRA fine-tune (rank 16,
Unsloth + TRL). The base model stays frozen.

## Measurement and the release gate

- Every suite splits deterministically into training and held-out tasks by task id (~40 % held out).
- Base model, live version and candidate run the same held-out tasks, `ENERGON_EVAL_RUNS` times each (default 5).
- The API, not the trainer, decides: a candidate is released when its success rate is at least the base
  model's and its lift over the reference (live version, else base) reaches `min_lift_pts` **and** exceeds
  its own spread across runs. Otherwise the version is stored as `rejected` with the reason.
- Releasing demotes the previous live version to `shipped`. Operators can make any shipped version live
  again (rollback). Rejected versions never go live.

## Security boundaries

- **Redaction at ingest.** Private keys, `sk-…`, `ghp_…`/`github_pat_…`, Slack and AWS keys, JWTs, bearer
  tokens, URL passwords, `*_TOKEN=`/`*_PASSWORD=`-style assignments, Energon keys and JSON fields named
  like secrets are replaced with `[REDACTED:<kind>]` before a run is stored. Nothing downstream sees them.
- **Runs stay private.** A job only receives runs of its own agent in its own organization.
- **No API keys on GPUs.** The trainer authenticates with an HMAC job token
  (`ENERGON_TRAINER_SECRET`, shared by API and worker) that unlocks one job and expires after 24 hours.
- **One adapter per agent.** Nothing is blended across agents or organizations.
- **Sandboxed practice.** Every attempt runs in a fresh workspace with a minimal environment and timeouts;
  with user namespaces available, additionally under bubblewrap (read-only system, no network).
- **Audit.** Each version records its job, the number of runs it trained on, the eval numbers and the gate decision.

## Running it

### Local, without a GPU

```bash
cd services/trainer
uv run --no-project --with pytest python -m pytest -q            # 39 suite tasks + pipeline
uv run --no-project python -m energon_trainer.cli experiment --backend fake --runs 2
```

The fake backend only exercises the wiring; its numbers say nothing about model quality.

### The experiment on a GPU

```bash
pip install -e 'services/trainer[gpu]'
energon-train experiment --suite linux_operator --model Qwen/Qwen2.5-Coder-7B-Instruct --runs 5
```

Writes `experiment/report.md` and `report.json`: base vs. compiled instructions vs. trained adapter on
held-out tasks, with spread and per-task results.

### Production: RunPod Serverless

1. **Image:** `docker build -t ghcr.io/<you>/energon-trainer:0.1 services/trainer && docker push …`
   (vLLM base image + Unsloth/TRL; first build takes a while).
2. **Endpoint:** RunPod → Serverless → New Endpoint → custom image. GPU: 24–48 GB for 7–8B models,
   48 GB+ for 14B. Execution timeout: 6 h. Min workers 0 (pay only while training). Optional network
   volume mounted at `/runpod-volume` caches model weights (`HF_HOME`).
3. **Endpoint environment:** `ENERGON_ARTIFACTS_ENDPOINT`, `ENERGON_ARTIFACTS_BUCKET`,
   `ENERGON_ARTIFACTS_ACCESS_KEY_ID`, `ENERGON_ARTIFACTS_SECRET_ACCESS_KEY`, optional `ENERGON_EVAL_RUNS`,
   `HF_TOKEN` for gated models.
4. **R2 bucket:** create a private bucket (e.g. `energon-adapters`) and an API token with read/write on it.
   The API uses the same `ENERGON_ARTIFACTS_*` values to presign downloads.
5. **API:** `ENERGON_TRAINER_SECRET` (≥ 32 random characters) and the `ENERGON_ARTIFACTS_*` variables.
6. **Worker:** `ENERGON_TRAINER_SECRET`, `RUNPOD_API_KEY`, `ENERGON_RUNPOD_ENDPOINT_ID`,
   `ENERGON_PUBLIC_API_URL` (where the trainer reaches the API), optional `ENERGON_TRAINING_JOB_TIMEOUT_MINUTES`.

Then enable training per agent in the dashboard (or `PUT …/training/config`) and either wait for the
configured hour or press **Train now**.

## Costs

Rough guide: a compiled-instructions night on a 7B model takes tens of GPU minutes, an adapter night up
to a few GPU hours, at well under one to a few dollars per GPU hour depending on the card. Nights only run
when an agent has collected `min_new_runs` new successful runs.

## Limits in v1

- One built-in suite (`linux_operator`). Agents whose work differs need their own suite file
  (`services/trainer/suites/<name>.toml`) for a meaningful gate.
- Adapters are delivered for self-hosted vLLM; Energon does not host inference yet.
- The GPU path (vLLM, Unsloth, image build) is covered by code review, not by CI. CI runs the full
  pipeline with the fake backend on Linux.
