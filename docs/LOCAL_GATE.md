# Local Gate

Run:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run demo:seed
npm run validate
```

If Playwright browsers are missing:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

Milestone 9 demo path check:

```bash
npm run test:e2e -- e2e/demo-path.spec.ts --project=chromium
```

The local gate must pass before committing a milestone unless an exact environment blocker is recorded in `BLOCKERS.codex.md`.
