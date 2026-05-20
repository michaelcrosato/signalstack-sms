# Compliance Contract

Owner: backend-data and tests-quality.

Milestone 0 hard gates:

- Live messaging disabled by default.
- Live billing disabled by default.
- Dummy messaging provider by default.
- Fake AI provider by default.
- No real credentials committed.

Future campaign sends must check consent, opt-out state, provider readiness, and live-action flags.
