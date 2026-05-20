# SignalStack SMS

SignalStack SMS is a 100% AI-coded SMB SMS/MMS SaaS repo. Milestone 0 establishes the scaffold, contracts, safety defaults, and validation gates only.

## Demo-safe defaults

- `DEMO_MODE=true`
- `LIVE_MESSAGING_ENABLED=false`
- `LIVE_BILLING_ENABLED=false`
- `MESSAGING_PROVIDER=dummy`
- `AI_PROVIDER=fake`

## Local validation

```bash
npm install
npm run validate
```

If Playwright browsers are missing:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

Product work starts only after Milestone 0 is green.
