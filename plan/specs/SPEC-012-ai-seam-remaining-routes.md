# SPEC-012 — Route campaign-copy + conversation-summary through the AI provider seam

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features · **Effort:** M

## Description
SPEC-007/008 introduced `resolveAiProvider()` (fake default + gated live) for reply drafting and lead
qualification. The remaining two AI endpoints — `campaign-copy` and `conversation-summary` — still call
`assertFakeAiProvider()` directly. Route them through the same seam for consistency: fake by default, live
only behind the existing AI hard gate (flag + key + cost-ack), analysis/draft only, PII-redacted, metered.

## Prereqs / deps
SPEC-007 (`lib/ai/provider.ts`, `lib/ai/ai-gate.ts`, usage cap/metering). No migration; no secrets (the live
client is mocked in tests).

## Implementation approach
1. Add `generateCampaignCopy(input)` + `summarizeConversation(input)` to the `AiProvider` seam; fake impls
   wrap `fakeCampaignCopyVariants`/`fakeConversationSummary` byte-for-byte; live impls reuse the existing
   redacted-prompt + defensive-parse pattern.
2. Refactor both routes to `resolveAiProvider()` + gate/cap/meter (fake→`recordFakeAiUsage`,
   live→`recordLiveAiUsage`); keep 400-first validation and `currentOrg.orgId` metering (existing tests).
3. Extend `ai:check` to assert both routes are seam-based and have no send path.

## Acceptance criteria
- [x] Default (`AI_PROVIDER=fake`) behavior byte-for-byte unchanged; all current AI tests pass.
- [x] Live path gated (flag+key+cost-ack), capped, PII-redacted; live client mocked in tests.
- [x] `ai:check` covers both routes; `npm run validate` green; no live calls by default.

## Test strategy
Unit: seam fake determinism + live mock for both ops; route 400-first preserved; gate denial. Reuse the
`provider-seam` + `ai-json-route` patterns.

## Out of scope
New AI features; streaming; multi-model routing; enabling a live provider.
