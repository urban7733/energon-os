# energon-sdk

The server-side Python SDK for Energon OS. It is a source package today; it is
not yet published to PyPI.

```python
import os

from energon_sdk import Energon

energon = Energon(
    base_url=os.environ["ENERGON_API_URL"],
    api_key=os.environ["ENERGON_AGENT_API_KEY"],
)

memory = energon.memory.remember(
    content="Verified: enterprise plan supports SSO.",
    tags=["pricing", "verified"],
)

context = energon.context.build(
    task="Answer an enterprise pricing question.",
    token_budget=1_500,
)
```

Agent identity, organization, project, and role are derived by the control
plane from the API key. Keep that key in a worker, server, container secret,
or secrets manager—never in browser code.

See [`docs/sdk-python.md`](../../docs/sdk-python.md) for installation and the
complete API surface.
