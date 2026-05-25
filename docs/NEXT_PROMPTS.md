# Next Prompts

This is the compact handoff for the next automated loop. Full history is in `LOOP_LOG.md` and `docs/LOOP_LOG.md`; do not reload historical logs unless the task requires it.

## Read First

1. `docs/AXIOMS.md`
2. `docs/AGENT-LOOP.md`
3. `PLAN.md`
4. `docs/CURRENT_STATE_MATRIX.md`
5. `planning/CONSENSUS-2026-05-21.md`
6. `contracts/**` with targeted reads
7. `docs/LOCAL_GATE.md`

## Current State

- Latest validated run: Run 771 added local message delivery breakdowns to the product analytics overview and `/dashboard/analytics`, with focused unit coverage and a product-demo assertion.
- The backend foundation is strong: tenant helpers, contacts, campaigns, queue jobs with per-recipient send-time skips, inbox, compliance gates, fake AI, local billing/analytics, provider metadata, Twilio webhook foundations, readiness audit, operations inventory, and validation gates.
- The browser product has a usable local demo path across dashboard, contacts import/detail/archive/restore/merge, campaign fake-AI copy/schedule/detail/edit/cancel plus recipient send-state/block-reason and delivery visibility, inbox thread work, template create/detail/edit, analytics with local delivery breakdowns, and compliance readiness.
- Live campaign sending, live billing, live AI, production auth, production secrets, production workers, and production deployment remain blocked by default.
- The only intentional live external-impact route is the isolated `/demo` live-test SMS path, gated by explicit Twilio credentials, live flags, recipient allowlist, and confirmation phrase.
- Auth scanner and live-worker hardening coverage is already very broad. Do not spend another loop on minor syntactic variants unless a concrete uncovered parser/control-flow gap is proven with targeted search.

## Next Work

1. Keep the product demo path stable and run the protected local gate before treating changes as green.
2. Prefer high-signal product-demo or production-readiness correctness work over more low-value syntactic test variants.
3. Good next targets: concise product demo polish, production auth/RBAC planning, deeper reporting visibility, idempotency scoping checks, or targeted live-worker controls that close a named gap.
4. Keep operations surfaces read-only and avoid expanding settings pages unless it directly supports release safety.
5. Keep all live SMS/provider/billing/AI/secret/destructive-production actions behind hard gates.

## Context Discipline

- Start with file heads/tails, current summaries, `git status`, `git log -3`, and targeted `rg`.
- Avoid reading full `SUMMARY.codex.md`, `BLOCKERS.codex.md`, `LOOP_LOG.md`, `docs/LOOP_LOG.md`, `docs/CURRENT_STATE_MATRIX.md`, or very large tests unless the next change requires exact historical context.
- If a handoff file starts growing into a run log, compact it and rely on the append-only logs for history.
- `npm run context:check` enforces the current-handoff budget during validation.
