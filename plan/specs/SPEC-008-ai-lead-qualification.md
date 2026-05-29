# SPEC-008 — Real AI lead qualification + scoring behind a gate

- **Status:** Todo · **Priority:** P3 · **Pillar:** Features · **Effort:** L

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
- [ ] Default fake provider returns deterministic scores; tests pass.
- [ ] Score persisted tenant-scoped; visible in UI; no consent/send side effects.
- [ ] Live path gated; usage metered; PII redacted.
- [ ] `npm run validate` green; no live calls by default.

## Test strategy
Unit: scoring contract + determinism (fake); persistence is tenant-scoped; no side-effect invariants;
gate denial without flags. Mock live client.

## Out of scope
Auto-routing/assignment automation, CRM sync, model training, autonomous follow-ups.
