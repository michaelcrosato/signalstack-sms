# AI Contract

Owner: integrations-ai.

Default AI provider is `fake`. Deterministic fake output is the default for every endpoint. A live AI
provider is permitted for supported endpoints under the AI hard gate (see below); it is off by default
and test-isolated. All endpoints are routed through the `resolveAiProvider` seam.

## Milestone 7 Fake AI Foundation

All AI endpoints use deterministic fake outputs while `AI_PROVIDER=fake`:

- `POST /api/ai/campaign-copy`: returns campaign copy variants from a prompt.
- `POST /api/ai/reply-suggestion`: returns a suggested reply from supplied messages or a tenant-scoped conversation.
- `POST /api/ai/conversation-summary`: returns a deterministic conversation summary.
- `POST /api/ai/lead-qualification`: returns deterministic score, stage, and reasons.

All endpoints select their provider through `resolveAiProvider()`:

- **Default `fake`** — byte-for-byte the prior deterministic suggestion; records `AI_REQUEST` with
  `provider: "fake"`. Unchanged.
- **Live** — used **only** when the AI hard gate (`lib/ai/ai-gate.ts#evaluateAiHardGate`) allows, i.e.
  `AI_PROVIDER=live` **and** `LIVE_AI_ENABLED=true` **and** `AI_API_KEY` present **and** `AI_COST_ACK=true`.
  Any missing condition falls back to `fake` (fail-safe). Enabling live requires human-supplied secrets +
  cost acknowledgement — a hard gate; never enabled in CI or demo.

Successful fake AI endpoint calls record one local `AI_REQUEST` usage event with fake-provider metadata. This is local analytics/metering only and must not call billing providers, live AI providers, messaging providers, notifications, or external services.

Demo/inbox inbound repository calls may classify conversation sentiment only after the inbound database transaction commits. The best-effort analysis is awaited so it cannot race an open transaction or depend on an untracked timer; analysis failure is logged without rolling back the stored message. Explicit inbound duplicates do not repeat analysis. Signed provider webhook handling disables this hook entirely, so webhook acknowledgement never depends on fake or live AI.

## Outbound/Inbound Isolation & Safety Rules

All live AI provider interactions must adhere to strict safety bounds:

1. **Analysis and draft only** — AI endpoints never directly trigger external messaging, notifications, billing changes, or database mutations of tenant configurations. Live output is always drafted for review.
2. **PII Redaction** — Prompts strip raw PII (such as phone-like runs redacted) and prompt/response bodies are never logged in the clear (PII-safe logger, SPEC-006).
3. **Usage Metering & Cap** — A per-tenant daily cap (`AI_DRAFT_DAILY_CAP`, default 100) bounds live requests; over the cap returns 429. Live usage records `AI_REQUEST` with `provider: "live"`. The `ai:check` gate asserts these invariants.

## Post-MVP Local AI Operations

The consolidated `/settings` readiness view renders the local AI safety boundary. It may display selected provider metadata, fake-provider readiness, endpoint coverage, AI usage totals, and recent local `AI_REQUEST` usage events. Interactive AI assists remain within their product workflows; there is no dedicated AI settings page.

This view is read-only. It must not submit prompts, call live AI providers, mutate conversations, expose API keys, create billing provider artifacts, send notifications, or enable live AI.

