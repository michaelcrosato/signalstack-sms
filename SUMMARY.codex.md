# Codex Summary

Run number: 778

- Latest loop prevents stale scheduled-campaign queue rows from sending from an old local schedule.
- `scheduleCampaign` now cancels any other queued local jobs for the same tenant campaign before upserting the active scheduled job.
- The scheduled-campaign worker now cancels a queued job whose payload `scheduledAt` no longer matches the campaign's active `scheduledAt`, before recipient mutations, dummy sends, or message rows.
- Added focused repository and worker coverage for missing/non-schedulable campaigns, failed preflight, stale queued-job cancellation, and stale worker-job cancellation.
- History is preserved in `LOOP_LOG.md` and `docs/LOOP_LOG.md`; current agents should use targeted `rg`, file heads/tails, and current summaries before loading large logs, contracts, or tests.
- Focused validation passed with `npm run test -- tests/unit/db/campaigns-schedule.test.ts tests/unit/queue/worker-processing.test.ts` and `npm run typecheck`; the protected local gate passed with `$env:PLAYWRIGHT_PORT='3137'; .\scripts\local-gate.ps1`.
- The change is local campaign/queue repository, worker, test, and docs only. It does not call Twilio/live providers, bill, notify, send live SMS or email, call live AI, expose secrets, enable live features, edit protected gate scripts, retry deliveries, hard-delete data, or perform destructive production actions.
