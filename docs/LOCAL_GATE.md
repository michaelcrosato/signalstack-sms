# Local Gate

Run:

```bash
npm install
npm run validate
```

If Playwright browsers are missing:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

The local gate must pass before Milestone 1 work starts unless an exact environment blocker is recorded in `BLOCKERS.bootstrap.md`.
