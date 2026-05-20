# Plan

This repo follows `docs/CANONICAL_IMPLEMENTATION_PLAN.md`.

## Completed Milestones

Milestone 0:

- Repo skeleton
- Source-of-truth docs
- Contract stubs
- Demo-safe env defaults
- Minimal Prisma schema
- Minimal Next app
- Smoke tests
- CI and validation skeleton

Milestone 1:

- Database/auth/organization foundations
- Deterministic demo current user and organization
- Tenant helper guardrails
- `GET /api/orgs/current`

Milestone 2:

- Contacts CRUD foundations
- Consent status and opt-out fields
- Tags/lists/segments schema foundations
- CSV import parser and demo-safe import endpoint
- Tenant-scoped contact repositories and tests

## Active Milestone

Milestone 3:

- Templates and campaign draft foundations
- Campaign preflight contract before send behavior
- No live SMS sending
