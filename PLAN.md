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
- Read-only local delivery operations view
- Read-only local team operations view
- Read-only local billing operations view
- Read-only local AI operations view
- Read-only local API operations view
- Read-only local contract operations view
- Local contract operations inventory static-metadata hardening
- Read-only local validation operations view
- Local security operations inventory static-metadata hardening
- Local security operations value-boundary hardening
- Read-only local security operations view
- Read-only local data operations view
- Read-only local queue operations view
- Read-only local notification operations view
- Local notification operations inventory static-metadata hardening
- Local notification operations value-boundary hardening
- Local notification operations whitespace-clean metadata hardening
- Local notification operations command-literal metadata hardening
- Local notification operations channel-vocabulary metadata hardening
- Local notification operations status-vocabulary metadata hardening
- Local notification operations channel-boundary term hardening
- Read-only local readiness audit operations view
- Local operator runbook admin-link coverage refresh
- Read-only local reporting index
- Read-only local integration operations view
- Read-only local workflow operations view
- Read-only local demo operations view
- Read-only local operations index
- Read-only local release operations view
- Read-only local health operations view
- Read-only local environment operations view
- Local operations index inventory unit coverage
- Local operations index backing page coverage
- Local API operations inventory backing route coverage
- Local API operations inventory reverse route-method coverage
- Local operator runbook shared-inventory coverage
- Local operations index reverse page inventory coverage
- Local go-live readiness shared-navigation coverage
- Local go-live readiness shared-navigation browser coverage
- Local launch dashboard shared-inventory coverage
- Local launch dashboard shared-inventory browser smoke coverage
- Local operations index shared-inventory browser coverage
- Local demo console shared-inventory navigation and browser coverage
- Local demo operations shared-inventory checkpoint coverage
- Local demo operations shared-inventory browser checkpoint coverage
- Local integration and security shared-inventory coverage
- Local environment, health, contract, and validation shared-inventory coverage
- Local admin exports shared-inventory coverage
- Local webhook, delivery, and team shared-inventory coverage
- Local billing and AI shared-inventory coverage
- Local data and messaging shared-inventory coverage
- Local provider, readiness, and runtime shared-inventory coverage
- Local shared operator projection unique-route coverage
- Local shared operator inventory unique-copy coverage
- Local shared operator inventory canonical-route-shape coverage
- Local page-specific operator projection self-link coverage
- Local shared operator inventory whitespace-clean coverage
- Local shared operator inventory copy-shape coverage
- Local shared operator inventory concise-copy coverage
- Local shared operator inventory order-stability coverage
- Local rich operator projection shared-inventory coverage
- Local shared operator projection order-stability coverage
- Local rich operator projection copy-boundary coverage
- Local broad operator projection supplied-inventory omission coverage
- Local shared operator focused-projection reachability coverage
- Local shared operator missing-route failure coverage
- Local shared operator route-copy alignment coverage
- Local shared operator action-neutral copy coverage
- Local rich operator boundary external-impact coverage
- Local shared operator projection immutability coverage
- Local shared operator projection fresh-array coverage
- Local shared operator projection array-freeze coverage
- Local shared operator projection result-freeze coverage
- Local shared operator projection deep-result-freeze coverage
- Local shared operator inventory runtime-freeze coverage
- Local shared operator projection detached-link coverage
- Local shared operator projection public-field coverage
- Local rich operator projection public-field coverage
- Local shared operator summary public-field coverage
- Local shared operator summary fresh-route-array coverage
- Local shared operator supplied-inventory duplicate-route failure coverage
- Local shared operator supplied-inventory empty-group failure coverage
- Local shared operator supplied-inventory duplicate-copy failure coverage
- Local shared operator supplied-inventory invalid-inventory-array failure coverage
- Local shared operator supplied-inventory inventory-array-shape coverage
- Local shared operator supplied-inventory array-index-descriptor coverage
- Local shared operator supplied-inventory sparse-index-descriptor coverage
- Local shared operator supplied-inventory empty-inventory failure coverage
- Local shared operator supplied-inventory blank-field failure coverage
- Local shared operator supplied-inventory invalid-link-array failure coverage
- Local shared operator supplied-inventory invalid-group-object failure coverage
- Local shared operator supplied-inventory invalid-link-object failure coverage
- Local shared operator supplied-inventory sparse-group failure coverage
- Local shared operator supplied-inventory sparse-link failure coverage
- Local shared operator supplied-inventory invalid-field-type failure coverage
- Local shared operator supplied-inventory route-shape failure coverage
- Local shared operator supplied-inventory route-shape variant coverage
- Local shared operator supplied-inventory own-field failure coverage
- Local shared operator supplied-inventory data-field failure coverage
- Local shared operator supplied-inventory enumerable-field failure coverage
- Local shared operator supplied-inventory plain-record failure coverage
- Local shared operator supplied-inventory exact-field failure coverage
- Local shared operator canonical pre-export validation coverage
- Local shared operator supplied-inventory link-array-shape coverage
- Local shared operator supplied-inventory link-array-index-descriptor coverage
- Local API operations inventory frozen-snapshot coverage
- Local API operations inventory public-field coverage
- Local API operations inventory value-shape coverage
- Local API operations inventory order-stability coverage
- Local contract operations inventory frozen static-metadata coverage
- Local contract operations inventory order-stability coverage
- Local contract operations inventory unique-identifier coverage
- Local contract operations package-script coverage
- Local contract operations secret-literal coverage
- Local validation operations inventory static-metadata coverage
- Local validation operations value-boundary coverage
- Local validation operations package-script coverage
- Local validation operations secret-literal coverage
- Local security operations package-script coverage
- Local security operations secret-literal coverage
- Local notification operations whitespace-clean coverage
- Local notification operations command-literal coverage
- Local notification operations status-vocabulary coverage
- Local notification operations channel-boundary term coverage

## Next Milestone

Post-MVP:

- Additional read-only admin views, safe dashboard refinements, local operator runbook expansion, route inventory refinements, shared navigation hardening, or deeper links from existing local-only reports and release surfaces into demo-safe operational workflows
