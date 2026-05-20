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

Milestone 3:

- Templates and campaign draft foundations
- Campaign preflight contract before send behavior
- No live SMS sending

Milestone 4:

- Queue/scheduling/send pipeline foundations
- Durable scheduled campaign job records
- Schedule/cancel API foundations
- Hard gates before any live provider behavior

Milestone 5:

- Shared inbox conversation/message API foundations
- Demo-safe inbound message creation
- Conversation assignment, internal notes, and resolve/reopen APIs
- STOP/HELP parsing foundations with local-only consent updates

Milestone 6:

- Centralized messaging hard gate
- Compliance profile/checklist API foundations
- Demo seed compliance readiness metadata
- Hard-gate tests for live messaging, provider readiness, A2P status, and consent

## Active Milestone

Milestone 7:

- AI feature foundations
- Fake AI provider-backed campaign copy, reply suggestions, summaries, and lead qualification APIs

## Next Milestone

Milestone 8:

- Analytics and billing model foundations
- Usage records, overview endpoint, and billing-safe metering
