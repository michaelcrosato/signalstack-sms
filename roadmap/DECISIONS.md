# Decisions Log (append-only, ADR-lite)

> One entry per autonomous judgment call: context → decision → reversible? → where it lives.

- 2026-06-11: QA deployment surface → Vercel (charter lists Next.js App Router; Vercel is the canonical platform for Next.js, offers automatic preview deployments per PR). Reversible. (department)
- 2026-06-11: Database service → Supabase (Postgres) (charter mandates Prisma/Postgres; Supabase is the conventional managed Postgres for Next.js/Prisma projects with dashboard, preview branching, and generous free tier). Reversible. (department)
- 2026-06-11: E2E test framework → Playwright (charter names Playwright explicitly in README and GOAL.md; already in use at "npm run test:e2e:smoke"). Not reversible without rewriting e2e tests. (department)
- 2026-06-11: GitHub repository → michaelcrosato/signalstack-sms (per department install runbook). Reversible. (department)
- 2026-06-11: Package manager → npm (charter mandates npm; package-lock.json is the only committed package-manager metadata). (department)

