# Codex Summary

Run number: 819

- Latest loop surfaces local provider error-code evidence in campaign detail delivery snapshots.
- `/dashboard/campaigns/:campaignId` now shows a `Provider Error Codes` metric and an `Error Code` chip on each recent outbound evidence row, derived from existing tenant-scoped `Message.providerErrorCode` metadata.
- Product campaign unit coverage and the seeded product-demo Playwright path now pin provider error-code visibility from the seeded failed delivery example.
- Focused validation passed with `npm run typecheck`, `npm run contracts:check`, `npm run test -- tests/unit/product/campaigns.test.ts`, `npm run demo:seed`, and `npm run test:e2e:product-demo`.
- Protected validation passed with `.\scripts\local-gate.ps1`.
- History is preserved in `LOOP_LOG.md` and `docs/LOOP_LOG.md`; current agents should start with `npm run agent:brief`, targeted `rg`, file heads/tails, and current summaries before loading large logs, contracts, or tests.
