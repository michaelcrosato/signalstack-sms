# SPEC-008 — Real AI lead qualification + scoring behind a gate

- **Status:** Done (2026-05-29) · **Priority:** P3 · **Pillar:** Features · **Effort:** L
  - Shipped: `qualifyLead` on the `AiProvider` seam (`lib/ai/provider.ts`: fake default + gated live, defensive JSON parse, PII-redacted prompt); tenant-scoped score persistence (`lib/db/repositories/lead-qualification.ts` + migration `20260529120721_lead_qualification_score` — nullable `Contact.leadScore`/`leadStage`/`leadQualifiedAt`); lead-qualification route refactor (gate/cap/meter; analysis-only, no send/consent change); `ai:check` rule; tests.
  - **Score surfaced read-only on the contact detail page** (`lib/product/contacts.ts` "Lead Score" row; verified by a live render — page shows `82 · HOT`). Remaining (BACKLOG/human): inbox-workspace surfacing + optional auto-routing; live AI enablement needs secrets.

## Description
`app/api/ai/lead-qualification/route.ts` exists on the fake provider. AI lead qualification/scoring/routing
is a competitive **differentiator** (only ~28% of SMB businesses use AI in SMS). Make it real behind the
same AI hard gate, producing a score + rationale + suggested next action from conversation + contact
context — never mutating consent or sending.

## Prereqs / deps
SPEC-007 (shared AI provider seam + gate) and TICKET009 (per-tenant attribution/RBAC). Live enablement is
human-gated. Builds on `lib/ai/conversation-context`.

## Implementation approach
1. Reuse the `AiProvider` seam from SPEC-007; add `qualifyLead(conversation, contact)` → `{score, factors,
   suggestedAction}`. Fake impl stays default + deterministic.
2. Persist score as tenant-scoped metadata (new field/table via migration); surface in inbox/contact UI.
3. No side effects: no consent change, no send, no provider/billing calls. Meter usage; redact PII.
4. Gate identical to SPEC-007 (`LIVE_AI_ENABLED` + key + cost-ack).

## Acceptance criteria
- [x] Default fake provider returns deterministic scores; tests pass. (`fakeAiProvider.qualifyLead` byte-for-byte; 423 tests green.)
- [x] Score persisted tenant-scoped + visible in UI; no consent/send side effects. (`persistContactLeadQualification` scoped by `orgId`, fail-safe; "Lead Score" row on the contact detail page — verified by live render showing `82 · HOT`.)
- [x] Live path gated; usage metered; PII redacted. (Same `ai:gate` + per-tenant cap as SPEC-007; phone-redacted prompt; live client mocked in tests.)
- [x] No live calls by default; demo-safe. Verified typecheck/lint/**423 tests**/build/`ai:check`/db:validate green + migration applied. (Full `npm run validate` also runs e2e:smoke — not run here, Chromium not installed.)

## Test strategy
Unit: scoring contract + determinism (fake); persistence is tenant-scoped; no side-effect invariants;
gate denial without flags. Mock live client.

## Out of scope
Auto-routing/assignment automation, CRM sync, model training, autonomous follow-ups.
