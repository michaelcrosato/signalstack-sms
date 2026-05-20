# SUMMARY.bootstrap.md

Agent: repo-bootstrap

Milestone 0 scaffold has been created with docs, contracts, scripts, CI skeleton, demo-safe defaults, minimal Prisma schema, minimal Next app, Vitest smoke test, and Playwright smoke test.

Validation passed with:

- `npm install`
- `npx playwright install chromium`
- `npm run test:e2e:smoke`
- `npm run validate`

Notes:

- Product features are intentionally not implemented.
- Dummy messaging and fake AI are the only active integration stubs.
- Live messaging and live billing are disabled by default.
