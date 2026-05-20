# Codex Blockers

Run number: 4

No active blockers.

## Notes

- `codex-runs/FULL_PLAN_RUN_4.md` was already untracked at the start of this run and contains the run prompt.
- The demo path requires the local PostgreSQL database to be migrated and seeded before running.
- The standard `npm run validate` gate runs the smoke Playwright test; the fuller investor demo path is available as `npm run test:e2e:demo`.
- Webhook foundations validate and store Twilio inbound/status events, but status transition processing and live provider-number routing remain future slices.
- Provider settings are read-only readiness metadata. There is still no provider credential storage UI, live send enablement flow, or real Twilio send path.
- The local worker processes due scheduled campaigns through the dummy provider only. Continuous polling is available for local demos, but it does not yet integrate Redis/BullMQ, enforce rate limits, or process Twilio status transitions.
- Windows can produce a Prisma client DLL rename error if `prisma generate` runs concurrently with a Next/Playwright server or another Prisma client process. Run Prisma generation and E2E checks sequentially.
