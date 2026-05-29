# SPEC-007 — Real AI reply drafting behind a hard gate (review-before-send)

- **Status:** Done — demo-safe slice (2026-05-29) · **Priority:** P2 · **Pillar:** Features · **Effort:** M
  - Shipped: `lib/ai/ai-gate.ts` (4-condition hard gate), `lib/ai/provider.ts` (`AiProvider` seam — fake
    default + gated live Anthropic client, draft-only, phone-PII-redacted prompt), `lib/ai/usage.ts`
    (`recordLiveAiUsage` + per-tenant `AI_DRAFT_DAILY_CAP`), reply-suggestion route refactor,
    `scripts/ai-check.ts` gate (wired into `validate`), `.env.example` flags, `tests/unit/ai/provider-seam.test.ts`.
  - **Still human-gated:** real key provisioning + live enablement (`AI_PROVIDER=live` + `LIVE_AI_ENABLED` +
    `AI_API_KEY` + `AI_COST_ACK`). Live path is mocked in tests; no live call in CI/demo.

## Description
AI is a deterministic fake (`lib/ai/fake-ai-provider.ts`); `app/api/ai/reply-suggestion/route.ts` exists.
AI message drafting is 2026 SMB table-stakes (EZ Texting AI Reply, Attentive AI Concierge). Introduce a
**real** AI provider behind an explicit cost/data hard gate, defaulting to the fake provider, producing
**draft** replies a human reviews before any send (no autonomous send).

## Prereqs / deps
SPEC-006 (usage/cost visibility). Shares the AI provider seam. Live provider enablement needs human-supplied
API keys + cost approval (hard gate) — keep fake as default. Relates to existing TICKET003 (inbox reply is
the surface that consumes drafts).

## Implementation approach
1. Define an `AiProvider` seam (`generateReplyDraft(context)`); keep `fake` as default impl. Add a real impl
   (Anthropic/OpenAI) selected only when `AI_PROVIDER=live` **and** `LIVE_AI_ENABLED=true` + key present.
2. Reply-suggestion route returns a **draft** only; never sends. The inbox UI shows draft → human edits →
   sends via the existing demo-safe outbound path (TICKET003).
3. Meter usage via `lib/ai/usage`; enforce a per-tenant cap; redact PII in prompts/logs (SPEC-006).
4. Extend a gate (`compliance`/new `ai:gate`) so live AI is blocked unless flag+key+cost-ack present.

## Acceptance criteria
- [x] Default (`AI_PROVIDER=fake`) behavior unchanged; all current AI tests pass. (411 tests green; fake response shape identical.)
- [x] With live flags+key, route returns a draft; **no message is ever auto-sent**. (Live provider returns a draft via mocked client; route has no send path; `ai:check` asserts it.)
- [x] Usage metered per tenant; cap enforced; prompts/logs carry no raw PII. (`recordLiveAiUsage(orgId,…)`; `AI_DRAFT_DAILY_CAP` on live path → 429; phone-PII redaction tested.)
- [x] Live AI blocked without flag+key+cost-ack. (`evaluateAiHardGate` requires all four; tested.) `npm run validate`: `ai:check`/typecheck/lint/test/build green; full run still aborts only at the known Windows `db:generate` EPERM.
- [x] No live AI calls in CI/demo (default off). (Gate off by default; live client fully mocked in tests.)

## Test strategy
Unit: provider seam selection by flags; draft-only contract; usage metering + cap; PII redaction. Mock the
live client (no real network/cost in tests).

## Out of scope
Autonomous sending, multi-model routing, fine-tuning, streaming UI, real key provisioning (human).
