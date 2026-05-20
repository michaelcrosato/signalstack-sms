# Codex Blockers

Run number: 10

No active blockers.

## Notes

- `npm run db:migrate` requires `DATABASE_URL` to be provided explicitly because Prisma config skips environment loading. The local documented value passed.
- Provider credential support and rotation history are metadata-only. Raw provider tokens are not persisted or returned, token fingerprints are not returned by the rotation API, no Twilio verification is performed, and live messaging remains blocked by existing hard gates.
- The `/settings/provider` metadata form uses the same local-only API boundary. It saves redacted readiness metadata, clears only local metadata, and does not call Twilio, revoke provider-side credentials, enable live messaging, or display raw tokens after submission.
- Production go-live documentation is a planning gate only and does not authorize `ALLOW_PRODUCTION_EXTERNALS=true` for routine demo/CI use.
- `npm run queue:bullmq:smoke` is now available, but no Redis service was configured in this run, so only the default skip path was exercised locally.
- There is still no live send enablement flow.
