# ULTRAPLAN — SignalStack SMS to the next level

North Star: go from **demo-safe scaffold** to **pilot-ready product** — a real SMB can log in, import
contacts, run a compliant campaign through a hardened Twilio path, and work the inbox — without ever
weakening the hard gates that protect live SMS/billing/AI, secrets, and production data.

Governing contract stays `docs/CANONICAL_IMPLEMENTATION_PLAN.md`; product roadmap stays `PLAN.md`.
This file is the strategic overlay and ticket map. Execute via the loop in `AGENTS.md`.

## Evidence (2026-05, measured this session)

- Gate is green (lint, typecheck, build, 795 unit tests, all domain gates); e2e needs Postgres (CI).
- **Test debt:** `tests/unit/auth/api-route-authorization.test.ts` (11,014 LOC) + `tests/unit/queue/live-worker-controls.test.ts` (11,715 LOC) = **65% of all test code (22,729 / 34,986)** — syntactic alias / proxy-reflection permutations, much of it for the **reserved, unimplemented** `production-live-campaign` class.
- **Surface imbalance:** 33 `/settings` (ops) pages vs 9 `/dashboard` (product) pages; 36 API routes.
- **Auth is a stub:** `lib/auth/demo-session.ts` returns a single hardcoded OWNER. No session/membership enforcement.
- **Compliance hard gate is solid:** `lib/compliance/gates.ts#evaluateMessagingHardGate` is the clean seam for live messaging (live flag + demo mode + provider + profile-complete + A2P-approved + per-contact consent).

## Pillars

### A. Pay down dead weight — unblock velocity (do FIRST)
The over-built test/ops surface is the main tax on every future change. Cutting it is the highest-leverage move.
- **A1. Collapse permutation tests.** Replace the two giant files with table-driven/representative coverage of the *real* invariants (mutating routes call `requireApiRole` before body parsing; worker readiness rejects non-`local-demo` classes). Target: 22.7k LOC → ≲1.5k LOC, no loss of meaningful coverage. Delete proxy/reflection arms-race cases for the unimplemented `production-live-campaign`.
- **A2. Shrink `contracts/CONTRACT-TESTING.md`** (399 lines) to the durable contract; drop the permutation catalogue.
- **A3. Consolidate operations surface.** Keep the ~8 `/settings` pages that support release safety (health, validation, security, queue, provider, compliance, usage, runbook); fold or remove the rest. Freeze new ops pages.
- **A4. Update `docs/CURRENT_STATE_MATRIX.md`, `docs/TESTING.md`, `docs/NEXT_PROMPTS.md`** to the slimmer reality.

### B. Finish the product to pilot quality — visible value
- **B1. Real auth/RBAC slice.** Replace `demo-session` with Clerk-backed session + active-membership enforcement at route level, behind the existing `production-auth:check` gate. Keep a demo fallback for local/seed. This is the single biggest unlock.
- **B2. Close inbox gap (TICKET003):** demo-safe local outbound reply via dummy provider + consent recheck.
- **B3. Template lifecycle:** delete/archive workflow + UI (current matrix gap).
- **B4. Audience depth:** segments/list UI on the existing schema; saved-segment campaign targeting.
- **B5. Campaign reporting:** delivery history beyond summary counts; per-recipient timeline.
- **B6. UX pass:** empty/loading/error states, consistent layout, one design review across `/dashboard`.

### C. Controlled live readiness — behind hard gates (design + gated build only)
- **C1. Twilio adapter hardening** beyond the isolated live-test SMS: messaging-service send, status callbacks, provider error mapping — all routed through `evaluateMessagingHardGate`.
- **C2. A2P registration workflow + compliance evidence** to satisfy the `A2P_NOT_APPROVED` gate (brand/campaign profile, opt-in evidence, quiet hours, HELP/STOP audit).
- **C3. Production infra:** Redis-backed rate limit + queue execution when configured; production observability with **no** PII/secret/message-body logging; secret storage discipline.
- **C4. Live AI + billing (last):** swap fake AI / stub billing for real providers only behind explicit cost + data-use gates (Stripe live, LLM provider). No live calls without human approval.

## Sequencing & success metrics

1. **Phase A (debt)** → exit when test LOC < ~14k with equal-or-better real coverage, `/settings` ≤ ~10 pages, gate green.
2. **Phase B (product)** → exit when a seeded user completes login→import→campaign→inbox→reply→resolve in e2e, with real RBAC denials covered.
3. **Phase C (live design)** → exit when the live path is fully designed + gated, A2P/observability/secret docs are executable checks, and flipping flags in a controlled env passes the gate with zero default external impact.

Run all phases through the maintenance loop in `AGENTS.md`; one focused ticket per iteration; `npm run validate` green or every failure explained + ticketed; commit to a branch and open a PR (never push `main` directly).

## Ticket map

Existing: TICKET001 (done), TICKET002 (e2e vs Postgres), TICKET003 (inbox reply), TICKET004 (repo-map upkeep), TICKET005 (context-check regression).

New (create as work begins, full template per `tickets/TICKET003.md`):
- **TICKET006** A1 — collapse `api-route-authorization` permutation tests to table-driven invariants.
- **TICKET007** A1 — collapse `live-worker-controls` tests; drop unimplemented-feature proxy cases.
- **TICKET008** A3 — consolidate `/settings` operations pages; freeze new ones.
- **TICKET009** B1 — Clerk-backed auth/RBAC slice behind `production-auth:check`.
- **TICKET010** B3 — template delete/archive workflow + UI.
- **TICKET011** B4 — segments/list targeting UI.
- **TICKET012** C1 — Twilio send + status-callback hardening through the hard gate (gated, no default live).
- **TICKET013** C2 — A2P registration + quiet-hours/HELP/STOP audit as executable compliance checks.

## Guardrails (non-negotiable)

- Never bypass hard gates: live SMS/MMS, live billing, live AI, real secrets, destructive/production DB, production workers, Clerk/prod-auth enablement. These need a human.
- Gate scripts + `docs/AXIOMS.md` are integrity-pinned; only humans edit them.
- Demo-safe defaults stay default. No live external impact in unattended runs.
- Honesty: a check is "passed" only if it ran and passed; unavailable gates are "not run".
