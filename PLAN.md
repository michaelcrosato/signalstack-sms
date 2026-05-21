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

Milestone 7:

- Deterministic fake AI provider functions
- Campaign copy, reply suggestion, conversation summary, and lead qualification APIs
- Tenant-scoped conversation message context for AI endpoints
- Tests proving fake AI behavior and live AI blocking

Milestone 8:

- Local usage event and billing account data model
- Analytics overview API
- Billing usage API with local-only recording
- Tests proving local metering and live billing defaults

Milestone 9:

- `/demo` investor demo console
- Deterministic Playwright demo path for import, campaign preflight/schedule, inbound STOP/HELP, fake AI, analytics, and usage
- Demo mode documentation for the end-to-end flow

Milestone 10:

- Hardening
- Contract/test expansion and CI repair
- API documentation drift gate
- Tenant `orgId` invariant gate
- Named seeded investor-demo E2E script

## Active Milestone

Post-MVP:

- Webhook foundations for Twilio inbound/status callbacks
- Read-only provider settings readiness endpoint
- Local dummy-provider scheduled campaign worker
- Local provider phone-number metadata API and demo seed
- Local live-readiness audit trail for configuration changes
- Local worker jobs-per-poll rate limit
- Optional BullMQ/Redis smoke command
- UI expansion
- Production deployment gates
- Production go-live gate design documentation
- API rate limiting
- Provider credential metadata management
- Provider credential metadata deletion
- Provider credential rotation history
- Read-only provider settings detail UI
- Provider credential metadata UI/forms
- Safe provider metadata form refinements
- Production-like demo deployment runbook
- Provider credential rotation-history filtering
- Read-only readiness audit filtering and CSV export
- Production observability planning and local doc gate
- Provider credential rotation-history CSV export
- Read-only admin exports view
- Local operator runbook and validation check
- Read-only local system status view
- Deployment platform notes and validation check
- Read-only local usage and analytics view
- Static local launch dashboard links to demo-safe admin/reporting views
- Read-only local operator runbook app view
- Read-only local compliance detail view
- Read-only local provider numbers view
- Read-only local campaign operations view
- Read-only local contact operations view
- Read-only local audience operations view
- Read-only local template operations view
- Read-only local inbox operations view
- Read-only local webhook operations view
- Read-only local team operations view
- Read-only local billing operations view
- Read-only local AI operations view
- Read-only local API operations view
- Read-only local contract operations view
- Read-only local validation operations view
- Read-only local security operations view
- Read-only local data operations view
- Read-only local queue operations view
- Read-only local notification operations view
- Read-only local readiness audit operations view

## Next Milestone

Post-MVP:

- Additional read-only admin views, safe dashboard refinements, local operator runbook expansion, route inventory refinements, or deeper links from existing local-only reports into demo-safe operational workflows
