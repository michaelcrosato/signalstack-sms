# Product Spec

SignalStack SMS is a self-hostable, multi-tenant SMS/MMS platform for small and midsize companies and
software teams. It combines transactional and campaign messaging, contacts/audiences, a shared inbox,
compliance controls, delivery operations, and a public integration API in one package.

## Primary users

- **Owner:** installs or commissions the system, creates the organization, connects provider accounts and
  numbers, configures compliance, team access, API credentials, retention, quotas, and backups.
- **Administrator:** manages contacts, audiences, templates, campaigns, provider operations, integrations,
  suppression, reports, and team roles within delegated authority.
- **Agent/member:** works assigned conversations, replies, adds notes, resolves threads, and uses approved
  templates/AI assistance without managing secrets or production controls.
- **Developer/integration:** uses scoped API keys and OpenAPI to send messages, sync contacts, create
  campaigns, read status, and consume signed event webhooks from company software.
- **Operator:** monitors health, queues, callbacks, provider errors, ambiguous sends, backups, restore
  drills, upgrades, retention, and incident controls.

## Core journeys

1. Clean install -> owner bootstrap -> login -> organization onboarding -> provider/number verification ->
   compliance readiness -> API key/webhook setup -> test message.
2. Import/create contacts -> capture consent -> create tags/lists/segments -> preview audience -> compose
   template/campaign -> preflight -> schedule -> monitor delivery -> pause/cancel/replay safely.
3. External software authenticates -> submits an idempotent direct message -> receives `202` -> reads status
   or receives signed updates -> retries only under documented semantics.
4. Carrier sends an inbound webhook -> account/number selects one tenant -> signature verifies -> message and
   conversation persist -> STOP suppresses immediately -> customer event is delivered -> team agent replies.
5. Worker/provider/database restarts during a send -> durable attempt is recovered without an automatic
   duplicate -> ambiguous outcome is reconciled or surfaced for operator action.
6. Operator backs up, destroys a sandbox deployment, restores it, verifies queue/provider reconciliation,
   upgrades with a preflight backup, and rolls application code back without corrupting schema state.

## Product boundaries

- The full core product runs with the included web/API, worker, PostgreSQL, ingress, media volume, and
  backup components.
- A carrier/CPaaS or direct SMSC connection is required for real mobile delivery; Twilio is the first
  supported adapter.
- Redis, external identity, hosted AI, Stripe, SMTP, object storage, hosted monitoring, and Vercel are
  optional.
- Fresh installs, tests, and CI use the dummy carrier and cannot send, charge, or call paid services.
- The product provides configurable compliance controls and evidence; it does not promise that toggling a
  setting alone makes a customer's traffic lawful.

## Success criteria

The product is feature complete only when every required row and milestone in
`docs/STANDALONE_ROADMAP.md` is `done` with current database, API, provider-contract, browser, container,
security, backup/restore, and upgrade evidence.
