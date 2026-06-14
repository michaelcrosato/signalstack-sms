# Billing Contract

Owner: backend-data.

Live billing is disabled by default with `LIVE_BILLING_ENABLED=false`. Milestone 0 has no Stripe mutations or billing jobs.

## Milestone 8 Local Usage Foundation

Billing and usage endpoints are local-only:

- `UsageEvent` records metering events for demo/test analytics.
- `BillingAccount` stores local billing status metadata and nullable Stripe placeholder IDs.
- `GET /api/billing/usage` returns local totals and recent usage.
- `POST /api/billing/usage` records local usage only.
- Successful fake AI endpoints may record local `AI_REQUEST` usage events after deterministic fake-provider output.

No endpoint may create Stripe customers, subscriptions, invoices, checkout sessions, payment intents, or charges. `LIVE_BILLING_ENABLED=false` remains the default and validation must prove live billing is blocked by default.

## Post-MVP Local Usage View

`/settings/usage` renders existing tenant-scoped analytics and local usage records for operator review. It is read-only and must not create usage events, call Stripe, create billing provider artifacts, expose secrets, send notifications, call providers, or enable live messaging.
