# SPEC-007 — Real AI reply drafting behind a hard gate (review-before-send)

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features · **Effort:** M

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
- [ ] Default (`AI_PROVIDER=fake`) behavior unchanged; all current AI tests pass.
- [ ] With live flags+key, route returns a draft; **no message is ever auto-sent**.
- [ ] Usage metered per tenant; cap enforced; prompts/logs carry no raw PII.
- [ ] Live AI blocked without flag+key+cost-ack; `npm run validate` green.
- [ ] No live AI calls in CI/demo (default off).

## Test strategy
Unit: provider seam selection by flags; draft-only contract; usage metering + cap; PII redaction. Mock the
live client (no real network/cost in tests).

## Out of scope
Autonomous sending, multi-model routing, fine-tuning, streaming UI, real key provisioning (human).
