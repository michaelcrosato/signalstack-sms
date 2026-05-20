# Risk Register

Primary Milestone 0 risks:

- Accidental live SMS or billing: blocked by env defaults and validation scripts.
- Secret leakage: `.env.example` contains placeholders only and `npm run secrets:scan` checks committed files.
- Contract drift: required contract files are checked by `npm run contracts:check`.
- Broken scaffold: `npm run validate` is the local gate.
