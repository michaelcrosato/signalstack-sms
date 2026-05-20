# Demo Mode

Demo mode is the default. Demo mode uses the dummy messaging provider and fake AI provider. It must not require Twilio, Stripe, Clerk secrets, real phone numbers, or paid AI calls.

Demo provider phone-number records are local metadata only. They are suitable for setup screens and seeded demos, but they do not provision or verify live provider numbers.

Demo provider credential records are redacted local readiness metadata only. The seed contains no raw provider token, does not verify anything with Twilio, and does not enable live messaging.

Demo provider credential rotation history is also local metadata only. Seeded history uses redacted values and configured booleans so readiness screens can show and export change history without raw secrets or provider calls.

The provider details screen can configure, rotate, clear, or CSV-export demo Twilio credential metadata history through local API routes. This is a readiness record only: submitted values are reduced to redacted identifiers and token fingerprints, raw auth tokens and fingerprints are not shown after submission or export, and no provider verification, live sending, billing, or provider-side revocation occurs.

Clearing provider metadata from the demo UI requires confirming that the action affects local readiness metadata only and does not revoke provider-side credentials.

The go-live readiness screen can link to a local CSV export of readiness audit events. This export is tenant-scoped demo/admin metadata only and does not call providers, send notifications, create billing records, or enable live messaging.

The admin exports screen consolidates local CSV links for readiness audit events and provider credential rotation history. It is read-only and does not create exports through a background job, call providers, expose raw secrets, send notifications, create billing records, or enable live messaging.

The usage and analytics screen at `/settings/usage` displays local tenant-scoped metrics, billing boundary status, and recent usage events. It is read-only and does not call Stripe, create billing provider artifacts, send notifications, call providers, or enable live messaging.

The root route `/` is a static local launch dashboard. It shows the demo-safe runtime defaults and links to the existing demo, readiness, provider metadata, system status, usage, and admin export views without requiring database access or creating side effects.

The local operator runbook screen at `/settings/runbook` displays demo-safe validation, seed, worker, export, and repair-loop commands from the local runbook. It is read-only and does not execute commands, mutate records, call providers, create billing records, send notifications, expose secrets, or enable live messaging.

Milestone 6 adds a compliance checklist for go-live readiness, but demo mode still blocks live messaging even when checklist fields are complete. STOP/HELP demo inbound flows update local database state only.

Milestone 7 AI endpoints use deterministic fake outputs only. Setting `AI_PROVIDER` to anything other than `fake` blocks those endpoints until a future live-AI gate exists.

Milestone 8 usage and billing records are local database rows for demo analytics. They do not create Stripe objects or charge payment methods.

## Investor Demo Path

The `/demo` route shows a compact seeded workspace summary:

1. Import opted-in contacts from CSV.
2. Preflight and schedule a demo-safe campaign.
3. Capture inbound HELP and STOP replies through local demo inbound APIs.
4. Generate fake AI lead qualification and related outputs.
5. Review analytics and local-only usage records.

`e2e/demo-path.spec.ts` drives this flow through local API routes. It requires the local database to be migrated and seeded, and it still does not send SMS, call live AI, or create billing provider artifacts.
