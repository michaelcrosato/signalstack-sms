You are the repo bootstrap coding agent for SignalStack SMS.

MISSION:
Complete Milestone 0 only for a new 100% AI-coded SMB texting SaaS repo.

First read:
- docs/CANONICAL_IMPLEMENTATION_PLAN.md
- AGENTS.md

Do not implement product features beyond minimal stubs required for the repo to validate.

Complete only:
- repo skeleton
- docs
- contracts
- scripts
- CI skeleton
- demo-safe env defaults
- minimal Prisma schema
- minimal Next app
- minimal Vitest smoke test
- minimal Playwright smoke test
- npm scripts
- validation command
- SUMMARY.bootstrap.md
- BLOCKERS.bootstrap.md

Required defaults:
DEMO_MODE=true
LIVE_MESSAGING_ENABLED=false
LIVE_BILLING_ENABLED=false
MESSAGING_PROVIDER=dummy
AI_PROVIDER=fake

Run:
npm install
npm run validate

If Playwright needs browser setup:
npx playwright install chromium
npm run test:e2e:smoke

Self-repair until validation passes, unless blocked by the local environment.

Hard stop:
Stop after Milestone 0 passes validation or after recording an exact environment blocker in BLOCKERS.bootstrap.md.

Final report:
Agent: repo-bootstrap
Branch:
Files created:
Files modified:
Commands run:
Validation result:
Known issues:
Exact next prompt:
