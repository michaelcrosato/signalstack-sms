# plan/RISK_REGISTER.md — transformation risks + rollback

Additive to the canonical **`docs/RISK_REGISTER.md`** (product/operational risks) — read that first. This
file covers risks introduced by executing `plan/` specs, with mitigations and rollback.

| ID | Risk | Likelihood | Impact | Mitigation | Rollback |
| --- | --- | --- | --- | --- | --- |
| R1 | CSP (SPEC-003) breaks page rendering / inline scripts | Med | Med | Ship **Report-Only** first; verify zero violations on `/`, `/dashboard`, `/demo`, `/settings`; only then enforce | Revert `next.config`/middleware header block; CSP is additive, no data change |
| R2 | CI service change (SPEC-002) makes a previously "green" pipeline go red by actually running e2e | Med | Med (good kind) | Land migrate+seed+services together; fix real e2e failures before merge | Revert workflow file; CI returns to prior (non-verifying) state |
| R3 | Dependency caret bump (SPEC-005) pulls a bad patch on fresh resolve | Low | Med | Stay within current majors; refresh lockfile; full `npm ci && validate` | `git checkout` package.json + package-lock; `npm ci` |
| R4 | Real AI (SPEC-007/008) incurs cost or leaks PII in prompts | Low (default off) | High | Hard gate `LIVE_AI_ENABLED`+key+cost-ack; fake default; PII redaction (SPEC-006); per-tenant cap | Flip flag off → fake provider; no schema rollback needed |
| R5 | Clerk auth (TICKET009) enablement requires secrets / could lock out demo | Med | High | Provider-agnostic `getAuthContext()`; demo fallback default; enablement human-gated | Flag off → demo session; no data change |
| R6 | RLS (SPEC-010) + pooling/`$transaction` interactions cause query failures or perf regressions | Med | High | Defense-in-depth behind app-level scoping; `EXPLAIN ANALYZE`; transaction-mode pooling validated in staging | Drop RLS policies (reversible migration); app-level scoping still protects |
| R7 | Major upgrades (next16/prisma7/zod4) bundled with features cause wide breakage | Med | High | BACKLOG only; **one major per isolated branch**, never with feature work; full gate + visual check | Revert the upgrade branch entirely |
| R8 | Migration data-loss on compliance/AI schema changes (SPEC-009/008) | Low | High | Additive columns/tables only; reversible migrations; never destructive on existing data; human approves prod migrate | `prisma migrate` down / restore from backup (human) |
| R9 | A planning/`plan/` doc drifts from canonical docs (duplication) | Med | Low | `plan/AGENTS.md` is a thin pointer; specs reference canonical docs; do not fork `ROADMAP`/`AGENTS`/`RISK_REGISTER` | Delete the divergent `plan/` file; canonical remains source of truth |

## Cross-cutting guardrails
- Never bypass hard gates (live SMS/billing/AI, secrets, destructive/prod DB, prod workers, Clerk
  enablement). Gate scripts + `docs/AXIOMS.md` integrity-pinned — human-only.
- Every change reversible and small; do not push/PR without human ask; no secrets committed.
- Honesty: a check is "passed" only if it ran and passed; e2e without Postgres is "not run."
