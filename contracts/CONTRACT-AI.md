# AI Contract

Owner: integrations-ai.

Default AI provider is `fake`. Deterministic fake output is the default for every endpoint. A live AI
provider is permitted for **reply drafting only**, and only behind the AI hard gate (see below); it is
off by default and test-isolated. All other endpoints remain fake-only this milestone.

## Milestone 7 Fake AI Foundation

All AI endpoints use deterministic fake outputs while `AI_PROVIDER=fake`:

- `POST /api/ai/campaign-copy`: returns campaign copy variants from a prompt.
- `POST /api/ai/reply-suggestion`: returns a suggested reply from supplied messages or a tenant-scoped conversation.
- `POST /api/ai/conversation-summary`: returns a deterministic conversation summary.
- `POST /api/ai/lead-qualification`: returns deterministic score, stage, and reasons.

`campaign-copy`, `conversation-summary`, and `lead-qualification` are blocked when `AI_PROVIDER` is not
`fake` (they call `assertFakeAiProvider()` and 403). No live provider calls, API keys, or paid AI usage are
allowed on those endpoints this milestone.

Successful fake AI endpoint calls record one local `AI_REQUEST` usage event with fake-provider metadata. This is local analytics/metering only and must not call billing providers, live AI providers, messaging providers, notifications, or external services.

## Reply drafting — gated live provider (SPEC-007)

`POST /api/ai/reply-suggestion` selects its provider through `resolveAiProvider()`:

- **Default `fake`** — byte-for-byte the prior deterministic suggestion; records `AI_REQUEST` with
  `provider: "fake"`. Unchanged.
- **Live** — used **only** when the AI hard gate (`lib/ai/ai-gate.ts#evaluateAiHardGate`) allows, i.e.
  `AI_PROVIDER=live` **and** `LIVE_AI_ENABLED=true` **and** `AI_API_KEY` present **and** `AI_COST_ACK=true`.
  Any missing condition falls back to `fake` (fail-safe). Enabling live requires human-supplied secrets +
  cost acknowledgement — a hard gate; never enabled in CI or demo.

Live drafting rules: it returns a **draft only and never sends a message** (a human reviews and sends via
the demo-safe outbound path). Prompts strip raw PII (phone-like runs redacted) and prompt/response bodies
are never logged in the clear (PII-safe logger, SPEC-006). A per-tenant daily cap (`AI_DRAFT_DAILY_CAP`,
default 100) bounds live drafts; over the cap returns 429. Live usage records `AI_REQUEST` with
`provider: "live"`. The `ai:check` gate asserts these invariants.

## Post-MVP Local AI Operations

`/settings/ai` renders the local AI safety boundary. It may display selected provider metadata, fake-provider readiness, endpoint coverage, AI usage totals, and recent local `AI_REQUEST` usage events.

This view is read-only. It must not submit prompts, call live AI providers, mutate conversations, expose API keys, create billing provider artifacts, send notifications, or enable live AI.
