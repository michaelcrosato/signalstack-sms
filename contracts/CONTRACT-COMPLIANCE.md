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
