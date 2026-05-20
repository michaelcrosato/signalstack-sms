# Demo Mode

Demo mode is the default. Demo mode uses the dummy messaging provider and fake AI provider. It must not require Twilio, Stripe, Clerk secrets, real phone numbers, or paid AI calls.

Demo provider phone-number records are local metadata only. They are suitable for setup screens and seeded demos, but they do not provision or verify live provider numbers.

Demo provider credential records are redacted local readiness metadata only. The seed contains no raw provider token, does not verify anything with Twilio, and does not enable live messaging.

Demo provider credential rotation history is also local metadata only. Seeded history uses redacted values and configured booleans so readiness screens can show change history without raw secrets or provider calls.

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
