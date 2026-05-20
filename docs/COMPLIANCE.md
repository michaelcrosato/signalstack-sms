# Compliance

Milestone 0 safety defaults block external impact:

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

Future SMS behavior must enforce consent, opt-out, STOP/HELP handling, tenant isolation, auditability, and provider readiness.

## Milestone 6 Compliance Gate

The canonical local gate is `evaluateMessagingHardGate` in `lib/compliance/gates.ts`.

Live messaging remains blocked unless all of these are true:

- Demo mode is off.
- `LIVE_MESSAGING_ENABLED=true`.
- The selected provider is not `dummy`.
- The org has a complete compliance profile.
- A2P registration status is `APPROVED`.
- The contact is active, explicitly opted in, and not opted out.

The compliance settings API stores go-live readiness metadata only. It does not send messages or enable live provider calls.
