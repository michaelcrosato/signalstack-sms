# Compliance Contract

Owner: backend-data and tests-quality.

Milestone 0 hard gates:

- Live messaging disabled by default.
- Live billing disabled by default.
- Dummy messaging provider by default.
- Fake AI provider by default.
- No real credentials committed.

Future campaign sends must check consent, opt-out state, provider readiness, and live-action flags.

Milestone 2 contact storage rules:

- `OPTED_OUT` contacts must retain `optedOutAt`.
- `OPTED_IN` contacts should retain `optInAt` and `optInSource` when available.
- CSV import is local-only and must not send messages or notify contacts.
- Contact deletion is soft archive only during the MVP foundation.

Milestone 3 preflight rules:

- Empty recipient sets are blocked.
- Archived contacts are blocked.
- Contacts not explicitly `OPTED_IN` are blocked.
- Opted-out contacts are blocked.
- Preflight does not schedule, enqueue, or send messages.

Milestone 5 inbound rules:

- Demo inbound APIs create local message records only.
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, and QUIT update the local contact to `OPTED_OUT` and set `optedOutAt`.
- HELP is recorded as an inbound keyword but does not opt a contact in and does not send a live or dummy outbound response yet.
- Inbox assignment, notes, resolve, and reopen operations are tenant-scoped.

Milestone 6 hard gate rules:

- The centralized messaging hard gate must block when `LIVE_MESSAGING_ENABLED` is not true.
- The centralized messaging hard gate must block when `DEMO_MODE` is active.
- The centralized messaging hard gate must block when the selected provider is `dummy`.
- The centralized messaging hard gate must block when the compliance profile is incomplete or A2P status is not `APPROVED`.
- Contact-level consent and opt-out checks remain required even if provider/configuration gates pass.

Post-MVP live-readiness audit rules:

- Compliance profile updates record local `LiveReadinessAuditEvent` rows.
- Provider phone-number metadata changes record local `LiveReadinessAuditEvent` rows.
- Audit listing and export filters must be bounded and tenant-scoped.
- Audit events and audit exports must not expose secrets, send notifications, call providers, call billing systems, mutate records, or enable live messaging.
