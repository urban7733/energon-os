# Live Agent Verification

`bun run agent:live` connects a real OpenAI-backed agent to a real Energon API
key. It creates one private memory from your supplied operational input, builds
a permission-filtered context pack, reads the resulting audit record, and has
the agent complete the task using that context.

Nothing is prefilled. The command fails unless every required value is supplied.
Secrets stay in your local shell and are never sent to the dashboard or written
to disk.

## Prerequisites

1. Sign in to the dashboard and create an agent in your production workspace.
2. Copy the newly returned agent API key into a local shell. It is displayed once.
3. Use an OpenAI API key locally. Do not put it in a client-side environment variable.
4. If x402 is enabled, provide a valid payment payload from your agent wallet or
   payment service through `ENERGON_PAYMENT_SIGNATURE`. The script does not bypass payment verification.

## Required environment

```bash
export ENERGON_API_URL=https://your-api-domain
export ENERGON_AGENT_API_KEY=your_agent_api_key
export OPENAI_API_KEY=your_openai_api_key
export OPENAI_MODEL=your_selected_model
export ENERGON_AGENT_TASK='your real task'
export ENERGON_AGENT_INPUT='your real operational input'
```

Optional values:

```bash
export ENERGON_AGENT_TAGS='tag-one,tag-two'
export ENERGON_CONTEXT_TOKEN_BUDGET=4000
export ENERGON_PAYMENT_SIGNATURE=your_verified_x402_payload
```

Run the verification:

```bash
bun run agent:live
```

The JSON result contains the real memory ID, context request ID, permission
counts, token usage, and final agent answer. The dashboard refresh then shows
the same memory, request usage, and audit data. Delete the generated private
memory from the dashboard when the verification is complete.
