# Codex Blockers

Run number: 832

- **No audit blockers in the current pass.** `npm run validate` completed green on
  `chore/repo-audit-2026-07-12`. Unit/e2e/DB suites need Postgres + Redis reachable on `localhost`
  (`docker compose up -d postgres redis` with Docker Desktop running); the deep tenant/RLS suites also
  need `RUN_DB_TESTS=true`.
- **Human-gated (out of scope for unattended runs):** live SMS/MMS, live billing (Stripe), live AI
  keys+cost, production RLS role provisioning, destructive/prod DB ops, and the TICKET023 items —
  trusted provider-account/number webhook tenant routing, webhook retry policy, live-test/paid-lookup
  operator-token provisioning, and human-reviewed integrity-manifest anchoring.
- **Documented latent risks** (not blockers, not changed this pass): see `docs/KNOWN_LIMITATIONS.md` —
  Twilio signature vs `request.url` behind a proxy, campaign re-send idempotency keyed on `queueJobId`,
  live-test "pending" rows that cannot self-resolve, and the contact-merge conservative consent
  downgrade.
- **Protected files remain human-owned:** axioms, protected gate scripts, and the integrity manifest.
- Current-only; history in `git log`.
