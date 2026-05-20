# Production Observability Plan

This plan covers demo-safe production-like deployments only. It does not authorize live SMS, live billing, live AI, provider-side verification, external notifications, real secrets, or vendor telemetry calls.

## Current Boundary

SignalStack SMS currently exposes local and platform-readable signals:

- `/api/health` for demo-safe runtime defaults.
- `npm run production:gate` for production-like external-impact flag checks.
- `npm run validate` for contracts, safety checks, typecheck, lint, tests, Playwright smoke, and build.
- `/settings` for admin-visible go-live readiness, blockers, provider metadata state, rate-limit policy, and audit history.
- `/api/settings/readiness-audit` and `/api/settings/readiness-audit/export` for tenant-scoped local readiness audit review.
- Worker logs from `npm run worker`, `npm run worker:watch`, and `npm run worker:bullmq` when explicitly run locally.

No current observability surface sends data to a third-party system or pages humans automatically.

## Signals To Track

For demo-safe deployments, platform logs and dashboards should track:

- Health route status and response latency.
- API `429` rate-limit counts.
- API `4xx` and `5xx` counts by route.
- Queue job status counts for `QUEUED`, `COMPLETED`, `FAILED`, and `CANCELLED`.
- Dummy-provider outbound message creation counts.
- Twilio webhook signature rejection counts.
- STOP and HELP inbound keyword counts.
- Fake AI endpoint request counts.
- Local billing usage event counts.
- Readiness audit event counts by action.
- Production gate pass/fail result before deployment.

These signals are operational metadata only. They must not include raw message bodies, auth tokens, provider fingerprints, Stripe identifiers, or customer secrets.

## Logging Rules

Logs may include route names, status codes, event types, org IDs, queue job IDs, campaign IDs, and redacted provider metadata.

Logs must not include:

- Raw Twilio auth tokens or account credentials.
- Raw Stripe secrets or webhook secrets.
- Raw provider credential fingerprints.
- Full customer message bodies.
- CSV import contents.
- Payment method data.
- Live provider API responses containing secrets.

## Future Vendor Integration Gate

Before adding Sentry, Datadog, OpenTelemetry collectors, hosted log drains, alerting, or paging:

- Add contracts for exported telemetry fields.
- Add a secret-safety review for telemetry payloads.
- Add tests proving message bodies and secrets are excluded.
- Add env gates so vendor export is disabled by default in local/demo/CI.
- Keep live SMS, live billing, live AI, provider calls, and notifications blocked unless separate future hard gates allow them.

## Local Validation

Run:

```bash
npm run observability:check
npm run validate
```

`observability:check` verifies that this plan and the linked deployment runbook remain present and retain the no-external-impact boundary.
