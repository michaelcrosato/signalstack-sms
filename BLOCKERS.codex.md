# Codex Blockers

Run number: 778

- No blocker from the stale scheduled-campaign queue pass. The protected local gate passed with `$env:PLAYWRIGHT_PORT='3137'; .\scripts\local-gate.ps1`.
- `npm run context:check` now fails validation if current handoff files grow beyond their budget or start embedding historical run-log markers again.
- The change is local campaign/queue repository, worker, test, and docs only and did not touch live SMS, live providers, billing, real secrets, Redis, protected gate scripts, delivery retry paths, hard deletes, or destructive production actions.
- Historical blocker notes are preserved in `LOOP_LOG.md` and `docs/LOOP_LOG.md`; keep this file current-only to avoid recursive handoff bloat.
