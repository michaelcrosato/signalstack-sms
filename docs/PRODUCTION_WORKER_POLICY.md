# Production Worker Policy

This policy is a planning gate for future live campaign sending. It does not authorize production worker execution, live SMS, provider calls, billing, notifications, live AI, secret storage, or destructive database operations.

## Current Allowed State

The current supported worker posture is local/demo only:

- `npm run worker` may process one local database-backed pass only when the runtime is not production-like, `MESSAGING_PROVIDER=dummy`, and `LIVE_MESSAGING_ENABLED` is not `true`.
- `npm run worker:watch` may poll repeatedly only under the same local/demo gate.
- `npm run worker:bullmq` may consume BullMQ jobs only when `QUEUE_BACKEND=bullmq`, `REDIS_URL` is configured, the runtime is not production-like, `MESSAGING_PROVIDER=dummy`, and `LIVE_MESSAGING_ENABLED` is not `true`.
- `npm run queue:bullmq:smoke` is an optional local Redis smoke check and must not touch campaign jobs, provider calls, billing, notifications, or live messaging flags.

`WORKER_DEPLOYMENT_CLASS` may be unset or `local-demo` only. Any other value, including future-looking names such as `production-live`, blocks scheduled-campaign worker startup until a later milestone adds reviewed live-worker controls.

Production-like runtime markers are `NODE_ENV`, `VERCEL_ENV`, `DEPLOYMENT_ENV`, or `APP_ENV` set to `production` or `prod`. These markers block scheduled-campaign worker execution today, even with demo-safe provider defaults.

## Future Live Worker Requirements

A future production worker milestone must satisfy all of these before any live campaign send path can run:

- A separate reviewed worker deployment class beyond `local-demo`, with explicit environment names, process ownership, and rollback steps.
- Org-level live messaging enablement separate from environment flags and separate from the isolated live-test SMS route.
- Centralized messaging hard-gate enforcement immediately before each provider mutation.
- Send-time contact consent, archive state, opt-out state, and compliance-profile rechecks for every recipient.
- Tenant-scoped idempotency for queue jobs, outbound messages, and provider/webhook correlation.
- Provider rate limits, queue backpressure, bounded retries, and duplicate-send prevention.
- Production secret storage through a secret manager, with no raw provider secrets in database rows, logs, API responses, exports, or client-rendered pages.
- Observability that redacts secrets and avoids exporting full message bodies unless a future data-use policy explicitly allows it.
- Billing and usage metering behavior that cannot create Stripe artifacts unless the live billing gate is separately complete.
- Emergency shutdown steps that restore the no-external-impact posture without code changes.
- Tests proving production-like worker startup remains blocked until the dedicated worker policy gate is implemented.

## Non-Requirements For Current Demo Deployments

Production-like demo deployments do not need a running worker. Campaign scheduling may continue to create local `QueueJob` rows for browser demo evidence, but those rows must not be processed by a production worker under the current gate.

The isolated `/demo` live-test SMS path remains separate from campaign workers. It must not be used as proof that bulk sending, scheduled campaign sending, or production worker execution is ready.
