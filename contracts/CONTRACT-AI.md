# AI Contract

Owner: integrations-ai.

Default AI provider is `fake`. Milestone 0 allows deterministic fake output only. Live AI providers must be gated and test-isolated before use.

## Milestone 7 Fake AI Foundation

All AI endpoints use deterministic fake outputs while `AI_PROVIDER=fake`:

- `POST /api/ai/campaign-copy`: returns campaign copy variants from a prompt.
- `POST /api/ai/reply-suggestion`: returns a suggested reply from supplied messages or a tenant-scoped conversation.
- `POST /api/ai/conversation-summary`: returns a deterministic conversation summary.
- `POST /api/ai/lead-qualification`: returns deterministic score, stage, and reasons.

If `AI_PROVIDER` is not `fake`, these endpoints are blocked in this milestone. No live provider calls, API keys, or paid AI usage are allowed.

## Post-MVP Local AI Operations

`/settings/ai` renders the local AI safety boundary. It may display selected provider metadata, fake-provider readiness, endpoint coverage, AI usage totals, and recent local `AI_REQUEST` usage events.

This view is read-only. It must not submit prompts, call live AI providers, mutate conversations, expose API keys, create billing provider artifacts, send notifications, or enable live AI.
