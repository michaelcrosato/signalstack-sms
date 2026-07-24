# TICKET027 — Admin control panel, onboarding & quotas

- **Milestone:** M9
- **Status:** Done
- **Priority:** P2

## Goal
Build out full self-hosted administrative UI surfaces for organization onboarding, team user management, local usage quotas, plan enforcement, system health diagnostics, and audit log inspection.

## Context
Initial dashboard and onboarding foundations exist (`app/dashboard/page.tsx`). M9 delivers complete self-hosted management capabilities for account creation, team roles, rate limit and message quota administration, API key rotation, webhook endpoint configuration, and operational health metrics without requiring external billing or identity SaaS.

## Scope
- **In:** Onboarding wizard for new organizations, team member invitation and RBAC management, local plan entitlements (contact limits, monthly message quotas, API key limits), Next.js admin management UI, system SLI and worker health dashboards.
- **Out:** External SaaS admin tools; hosted Stripe billing requirements.

## Likely files
`app/dashboard/page.tsx`, `app/account/page.tsx`, `lib/operations/operator-surfaces.ts`, `components/layout/side-nav.tsx`, `tests/unit/operations/settings-surface-allowlist.test.ts`.

## Acceptance criteria
- [x] New operator can bootstrap organization, team, and provider setup entirely through Next.js admin UI.
- [x] Local quota enforcement blocks contact creation or message queueing when organization plan limits are reached.
- [x] Settings pages adhere strictly to the frozen settings surface allowlist.
- [x] Keyboard navigation and responsive UI layout requirements pass.
- [x] Admin UI unit tests and page route checks pass.

## Commands
`npm test -- operator-surfaces`, `npm run standalone:check`, `npm run validate`
