# Codex Summary

Run number: 791

- Latest loop makes local outbound worker idempotency keys tenant-explicit before dummy provider calls and `Message` upserts.
- Added `outboundCampaignMessageIdempotencyKey` in `lib/queue/idempotency.ts` and updated the scheduled campaign worker to use it for provider request evidence and local message idempotency.
- Focused queue tests now pin the tenant-explicit key format and updated worker expectations verify the provider input plus `(orgId, idempotencyKey)` message upsert path.
- `contracts/CONTRACT-QUEUE.md`, `contracts/CONTRACT-TESTING.md`, `docs/TESTING.md`, `docs/NEXT_PROMPTS.md`, and `docs/CURRENT_STATE_MATRIX.md` now record the worker outbound idempotency boundary.
- History is preserved in `LOOP_LOG.md` and `docs/LOOP_LOG.md`; current agents should start with `npm run agent:brief`, targeted `rg`, file heads/tails, and current summaries before loading large logs, contracts, or tests.
- Focused validation passed with `npm run test -- tests/unit/queue/jobs.test.ts tests/unit/queue/worker-processing.test.ts` and `npm run typecheck`; the protected local gate passed with `$env:PLAYWRIGHT_PORT='3154'; .\scripts\local-gate.ps1`.
- The change is local queue idempotency code, tests, docs, and handoff updates only. It does not use production credentials, call real Twilio, bill, notify, send SMS or email, call live AI, expose secrets, enable live features, edit protected gate scripts, hard-delete data, or perform destructive production actions.
