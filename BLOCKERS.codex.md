# Codex Blockers

Run number: 5

No active blockers.

## Notes

- `codex-runs/FULL_PLAN_RUN_5.md` was already untracked at the start of this run and contains the run prompt.
- The demo path requires the local PostgreSQL database to be migrated and seeded before running.
- The standard `npm run validate` gate runs the smoke Playwright test; the fuller investor demo path is available as `npm run test:e2e:demo`.
- Webhook foundations validate and store Twilio inbound/status events. Status webhooks now update local message delivery metadata.
- Provider settings are read-only readiness metadata. Provider phone-number metadata is local-only and does not prove ownership or provision Twilio numbers.
- There is still no provider credential storage UI, live send enablement flow, or real Twilio send path.
- The local worker processes due scheduled campaigns through the dummy provider only. Continuous polling is available for local demos, but it does not yet integrate Redis/BullMQ or enforce rate limits.
- Windows can produce a Prisma client DLL rename error if `prisma generate` runs concurrently with a Next/Playwright server or another Prisma client process. Run Prisma generation and E2E checks sequentially.
