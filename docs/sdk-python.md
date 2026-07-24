# Python SDK

`energon-sdk` is the server-side Python client for an authenticated Energon
agent. It lives in `packages/sdk-python` and is not published to PyPI yet.

## Install from this repository

```bash
python -m pip install "git+https://github.com/urban7733/energon-os.git#subdirectory=packages/sdk-python"
```

Keep `ENERGON_AGENT_API_KEY` in a worker, server, container secret, or secrets
manager. It must never be included in browser code.

```python
import os

from energon_sdk import Energon

energon = Energon(
    base_url=os.environ["ENERGON_API_URL"],
    api_key=os.environ["ENERGON_AGENT_API_KEY"],
)

memory = energon.memory.remember(
    content="Customer has an approved Swiss enterprise contract.",
    tags=["customer", "contract", "verified"],
)

context = energon.context.build(
    task="Answer the customer's contract question.",
    token_budget=1_500,
)
```

## Skill profiles

Profiles are declarative personalization data, not executable tools or trusted
instructions. An agent may create a private profile only for itself; the API
returns only profiles that are assigned to that agent.

```python
awaiting_approval = energon.skills.create(
    name="Careful support writer",
    instructions="Cite verified facts and ask before sending an external reply.",
    allowed_tools=["read_memory", "write_draft"],
    requires_approval_for=["send_external_reply"],
)

assigned_profiles = energon.skills.list()
```

The SDK intentionally does not retry write requests automatically. A timeout
after `POST` can be ambiguous without an idempotency key. HTTP errors raise
`EnergonError`; connection or response-shape failures raise
`EnergonNetworkError`.
