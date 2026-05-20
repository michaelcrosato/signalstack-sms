# Demo Mode

Demo mode is the default. Demo mode uses the dummy messaging provider and fake AI provider. It must not require Twilio, Stripe, Clerk secrets, real phone numbers, or paid AI calls.

Milestone 6 adds a compliance checklist for go-live readiness, but demo mode still blocks live messaging even when checklist fields are complete. STOP/HELP demo inbound flows update local database state only.
