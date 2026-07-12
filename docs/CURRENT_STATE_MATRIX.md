# Current State Matrix

Last updated: 2026-07-12. Governing roadmap: `docs/STANDALONE_ROADMAP.md`.

This file is intentionally compact. Historical detail belongs in Git and the standalone verification
ledger; the rows below describe current implementation truth only.

SignalStack is a strong demo-safe product foundation, not yet a standalone production SMS platform.
Built-in local identity, database-enforced tenant isolation, and the public API/customer-webhook platform
are complete and validated. Provider ownership/routing, durable carrier sends, packaging, and recovery
remain incomplete.

| Area | Backend/API State | Browser State | Main Gap | Next Action |
| --- | --- | --- | --- | --- |
| Standalone platform | Strong demo-safe domain/queue foundation plus complete built-in identity, database tenant boundary, and public integration platform. | Seeded product and real local-auth workflows are usable. | Provider ownership, carrier execution, packaging, and recovery are incomplete. | Execute M4, then M5–M11 in `docs/STANDALONE_ROADMAP.md`. |

| Area | Implemented now | Missing for standalone completion | Roadmap |
| --- | --- | --- | --- |
| Identity/team | Built-in scrypt credentials; keyed opaque sessions; owner bootstrap; operator create/reset CLIs; login/logout/reset; organization selection; invite/reinvite/role/suspend/revoke; fail-closed page/API auth; explicit demo-only fallback. | Optional OIDC and verified invite delivery remain adapters, not standalone requirements. | M1 done |
| Tenant database boundary | M2 completed a fresh 40-migration/27-protected-table checkpoint. The current 43-migration schema protects 36 tables after adding the M3 credential, idempotency, integration-audit, customer-event, delivery, attempt, disable-reconciliation, and durable attempt-reservation substrate. The least-privileged owner/runtime split, forced fail-closed RLS, semantic fingerprints, exact control policies, bounded dispatch functions, same-tenant relations, and mandatory two-tenant matrix extend to those rows. | No current tenant-boundary gap. Every later tenant model and repository path must continue to join the manifest, contexts, fingerprints, and mandatory PostgreSQL matrix. | M2 boundary maintained through M3 |
| Public integrations | One-time scoped API keys; browser ADMIN key lifecycle; bearer-only `/api/v1` organization/resource/message/campaign/conversation/status surfaces; stable envelopes/errors/request IDs; HMAC cursors; PostgreSQL rate limits; encrypted idempotent replay; generated OpenAPI; curl/TypeScript/Python examples; atomic customer-event fanout; encrypted signing secrets; SSRF-resistant delivery; retry/disable/replay/rotation; provider-callback and receiver-verification examples. The message/reply surface accepts dummy/local work only and makes no carrier call. | No M3 gap. Future resource changes must preserve the versioned compatibility contract; live transport belongs to M5/M6, not this milestone. | M3 done |
| Provider control plane | Dummy provider; redacted Twilio metadata/rotation history; local number metadata; isolated env-backed live test. | Encrypted recoverable secrets, account/number verification, globally unique ownership, provider factory, trusted tenant routing, health. | M4 |
| Direct outbound | Idempotent public and inbox dummy/local message acceptance plus an isolated reserved live-test send. | General durable carrier message/attempt outbox, real Twilio adapter, callback correlation, reconciliation, and ambiguity UI. | M5 |
| Inbound/status | Twilio form parsing/signatures, durable webhook leases, idempotency, monotonic status updates. | Resolve account + destination to one tenant, tenant credential validation, live replies, media, full keyword behavior, customer events. | M6 |
| Campaigns/queue | Draft/preflight/schedule/cancel, durable DB jobs, owner leases, race-tested terminal transitions, optional BullMQ mirror, dummy worker. | Production live worker, final hard gate, provider throttling/backpressure, per-recipient attempts, retry/DLQ/replay, kill switch, saved audiences. | M7 |
| Contacts/audiences | Public contact/tag/list/list-membership/saved-segment CRUD and bounded segment evaluation; CSV parse/import; archive/restore/merge; ad-hoc segment query/export. | Browser administration, file mapping, suppression workflows, audience snapshots/estimates, and campaign targeting remain. | M7/M9 |
| Inbox | Demo inbound/reply, public conversation/message reads and dummy/local replies, notes, assignment, resolve/reopen, sentiment/summary/lead signals, and outbound customer conversation events. | Trusted production inbound/live replies, unread/search/filter/SLA, media, and safe realtime refresh remain. | M6/M9 |
| Templates/MMS | Template CRUD and plaintext preview engine; campaign copy assistance. | Archive/versioning, preview integration, media model/storage, MMS provider path, test-send and richer campaign history. | M7/M9 |
| Compliance | Central gates, consent state/evidence constraint, double opt-in seam, quiet-hours logic, STOP/START classification, readiness profile. | Complete evidence-bearing registration/business fields, append-only consent/audit events, authoritative timezone/policy, suppression, retention and provider proof. | M8 |
| AI | Deterministic fake provider and optional gated Anthropic seam. | No hosted dependency is required; finish UX/governance only as optional value. | M9 |
| Plans/quotas | Local usage events and demo billing-account metadata. | Built-in entitlements/quotas and owner controls; optional billing adapter. | M9 |
| Analytics/ops | Product counts/delivery evidence, structured logs, local metrics, read-only operations pages. | Protected metrics, worker heartbeat, time ranges, queue/provider SLIs, alerts, audit search/export, customer reports. | M9/M10 |
| Privacy/lifecycle | Redaction helpers, secret scan, write-once consent bundle. | Message/media/webhook retention, export/delete/legal hold, cleanup jobs, complete secret scanning and audit immutability. | M8/M10 |
| Packaging | Safe Docker context, web Dockerfile, Compose for Postgres and optional Redis, demo runbooks. | Non-root standalone image, ingress/web/migration/worker/backup stack, internal networks/secrets/health/resource controls. | M0 done / M10 |
| Backup/upgrade | Prisma forward migrations and app-image rollback note. | Scheduled encrypted backups, off-host option, RPO/RTO, restore drill, pre-migration snapshot, expand/contract upgrades and rollback rehearsal. | M10 |
| Verification | M1/M2 checkpoint evidence remains the production local-auth browser proof plus the fresh 40-migration/27-table boundary proof recorded in the roadmap. Current gates extend to 43 migrations/36 protected tables; the mandatory tenant gate is 12 files / 49 tests and the focused public API suite is 30 files / 111 tests. Evidence also includes generated-OpenAPI drift, cross-runtime examples, webhook crypto/transport/worker recovery suites, and a literal Next HTTP + receiver-socket lifecycle proof using separate NOINHERIT web/worker logins for forced-RLS organization A/B and method-boundary evidence. | Provider/carrier, production-container, backup/restore, upgrade, and release evidence remain. | M3 done; M11 pending |

## Immediate implementation order

1. Build M4 provider ownership/secrets without weakening the completed M3 boundary.
2. Continue through M5–M11 without treating dummy/local behavior as carrier-production proof.
