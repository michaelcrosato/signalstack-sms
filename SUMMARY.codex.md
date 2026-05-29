# Codex Summary

Run number: 828

- **All plan specs SPEC-001..010 + TICKET003/009 are DONE** (see `plan/PROGRESS.md`). Recent: SPEC-007 (AI
  reply-draft seam, gated live), SPEC-008 (AI lead-qual + score persistence + contact-UI), SPEC-009
  (quiet-hours + consent-evidence migration), SPEC-010 (Postgres RLS backstop), TICKET009 (session seam).
- **Full protected gate is GREEN end-to-end on Windows.** `pwsh scripts/local-gate.ps1` / `npm run validate`
  pass through 17 migrations, `db:generate` (now retry-wrapped, `scripts/db-generate.ts`), typecheck, lint,
  **424 unit tests**, **e2e:smoke** (Chromium installed; self-starts dev server on :3100 vs docker Postgres),
  and build. RLS proof test passes behind `RUN_DB_TESTS=true`.
- **Repo is AFK-ready.** `npm run afk:preflight` = services up (postgres/redis, `restart: unless-stopped`) +
  migrate + seed + Chromium + gate. Launch the 12h run: `pwsh scripts/agent/afk-12h.ps1 -FullYolo` (or
  `pwsh scripts/run-codex-yolo-loop.ps1 -FuseMinutes 720 -FullYolo`). See `docs/AFK_RUNBOOK.md`.
- **AFK work queue** (demo-safe, no secrets): `plan/specs/SPEC-011..015` — inbox lead-score, AI seam for
  campaign-copy+summary, per-state quiet hours, consent-evidence immutability, delivery metrics counters.
- Live SMS/billing/AI/Clerk enablement + RLS production role wiring remain human-gated.
- History in `git log`; start with `npm run agent:brief`.
