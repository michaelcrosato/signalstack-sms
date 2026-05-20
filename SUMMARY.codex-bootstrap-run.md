Agent: repo-bootstrap

Branch: `main`

Files created:
- Root config: `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, Next/TS/ESLint/Tailwind/Vitest/Playwright/Prisma configs
- App stubs: `app/**`, `components/**`, `lib/**`, `workers/index.ts`
- Prisma: `prisma/schema.prisma`, `prisma/seed.ts`
- Docs/contracts: `README.md`, `PLAN.md`, `CONTRACTS.md`, `docs/**`, `contracts/**`
- Scripts: `scripts/**`
- CI/prompts: `.github/workflows/**`, `.cursor/rules/max-yolo.mdc`, `prompts/**`
- Tests: `tests/smoke/bootstrap.test.ts`, `e2e/smoke.spec.ts`
- Handoff: `SUMMARY.bootstrap.md`, `BLOCKERS.bootstrap.md`

Files modified:
- Existing `AGENTS.md`, `docs/CANONICAL_IMPLEMENTATION_PLAN.md`, and `prompts/bootstrap/REPO_BOOTSTRAP.md` were preserved.

Commands run:
- `npm install`
- `npm run validate`
- `npx playwright install chromium`
- `npm run test:e2e:smoke`
- `npm run validate`

Validation result:
- Passed. `npm run validate` completed contracts check, secrets scan, compliance check, lint, typecheck, Prisma validate/generate, Vitest smoke, Playwright smoke, and Next build.

Known issues:
- No blockers recorded.
- Non-blocking warnings remain: Next notes its ESLint plugin is not detected in the flat config, and Node warns about `spawnSync` with `shell: true` in the validation runner.
- `npm install` reported 2 moderate audit findings.

Exact next prompt:
```text
You are the backend/data agent for SignalStack SMS.

MISSION:
Implement Milestone 1 database/auth/org foundations only.

First read:
- docs/CANONICAL_IMPLEMENTATION_PLAN.md
- AGENTS.md
- contracts/CONTRACT-DB.md
- docs/DATA_MODEL.md
- docs/LOCAL_GATE.md
- SUMMARY.bootstrap.md
- BLOCKERS.bootstrap.md

Scope:
- Strengthen the Prisma data model for organizations, users, memberships, and tenant foundations.
- Add Clerk-ready auth structure and app-local membership helpers.
- Add tenant-scoping utilities and minimal repository patterns.
- Add focused tests for org membership and tenant invariants.
- Do not implement campaign, inbox, AI, billing, queue, Twilio, or product UI features beyond required stubs.

Required validation:
npm install
npm run validate

Stop after Milestone 1 passes validation or after recording an exact environment blocker.
```