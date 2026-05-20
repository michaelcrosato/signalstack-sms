# Billing Contract

Owner: backend-data.

Live billing is disabled by default with `LIVE_BILLING_ENABLED=false`. Milestone 0 has no Stripe mutations or billing jobs.

## Milestone 8 Local Usage Foundation

Billing and usage endpoints are local-only:

- `UsageEvent` records metering events for demo/test analytics.
- `BillingAccount` stores local billing status metadata and nullable Stripe placeholder IDs.
- `GET /api/billing/usage` returns local totals and recent usage.
- `POST /api/billing/usage` records local usage only.

No endpoint may create Stripe customers, subscriptions, invoices, checkout sessions, payment intents, or charges. `LIVE_BILLING_ENABLED=false` remains the default and validation must prove live billing is blocked by default.
