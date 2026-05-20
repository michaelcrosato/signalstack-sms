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

## Active Milestone

Milestone 6:

- Compliance gates and demo mode expansion
- Centralized provider/send hard gates
- Compliance profile/checklist foundations
- Demo scenarios for STOP/HELP and inbox flows

## Next Milestone

Milestone 7:

- AI feature foundations
- Fake AI provider-backed copy, reply suggestion, summaries, and lead qualification APIs
