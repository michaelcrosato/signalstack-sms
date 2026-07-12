# Current State Matrix

Last updated: 2026-07-12. Governing roadmap: `docs/STANDALONE_ROADMAP.md`.

This file is intentionally compact. Historical detail belongs in Git and the standalone verification
ledger; the rows below describe current implementation truth only.

SignalStack is a strong demo-safe product foundation, not yet a standalone production SMS platform.
Built-in local identity, database-enforced tenant isolation, the public API/customer-webhook platform, and
the M4 provider ownership/routing control plane are complete and validated. Durable carrier sends,
packaging, and recovery remain incomplete.

| Area | Backend/API State | Browser State | Main Gap | Next Action |
| --- | --- | --- | --- | --- |
| Standalone platform | Strong demo-safe domain/queue foundation plus complete built-in identity, database tenant boundary, public integration platform, and provider ownership/routing control plane. | Seeded product, real local-auth, and safe ADMIN provider-control workflows are usable. | Durable carrier execution, packaging, and recovery are incomplete. | Execute M5–M11 in `docs/STANDALONE_ROADMAP.md`. |

| Area | Implemented now | Missing for standalone completion | Roadmap |
| --- | --- | --- | --- |
| Identity/team | Built-in scrypt credentials; keyed opaque sessions; owner bootstrap; operator create/reset CLIs; login/logout/reset; organization selection; invite/reinvite/role/suspend/revoke; fail-closed page/API auth; explicit demo-only fallback. | Optional OIDC and verified invite delivery remain adapters, not standalone requirements. | M1 done |
| Tenant database boundary | M2 completed a fresh 40-migration/27-protected-table checkpoint; M3 reached 43/36. The current 51-migration schema protects 39 tables after M4 adds provider account, credential-secret, and messaging-service rows plus verified-number ownership/routing invariants. The least-privileged owner/runtime split, forced fail-closed RLS, semantic fingerprints, exact control/routing policies, bounded dispatch functions, same-tenant relations, and mandatory two-tenant matrix extend to those rows. | No current tenant-boundary gap. Every later tenant model and repository path must continue to join the manifest, contexts, fingerprints, and mandatory PostgreSQL matrix. | M2 boundary maintained through M4 |
| Public integrations | One-time scoped API keys; browser ADMIN key lifecycle; bearer-only `/api/v1` organization/resource/message/campaign/conversation/status surfaces; stable envelopes/errors/request IDs; HMAC cursors; PostgreSQL rate limits; encrypted idempotent replay; generated OpenAPI; curl/TypeScript/Python examples; atomic customer-event fanout; encrypted signing secrets; SSRF-resistant delivery; retry/disable/replay/rotation; provider-callback and receiver-verification examples. The message/reply surface accepts dummy/local work only and makes no carrier call. | No M3 gap. Future resource changes must preserve the versioned compatibility contract; live transport belongs to M5/M6, not this milestone. | M3 done |
| Provider control plane | Account-hash/AAD-bound AES-256-GCM credential envelopes; verified account/number/service ownership; safe ADMIN verification/rotation/revocation/health/discovery/import/default/disable; deterministic dummy and fixture-only Twilio factory; exact callback routing; canonical `IntegrationAuditEvent` evidence. Legacy provider credential/rotation rows remain unverified/display-only. | General message creation remains blocked until the M5 durable outbox and live-send gate; M4 performs no sends or provider-resource mutation. | M4 done |
| Direct outbound | Idempotent public and inbox dummy/local message acceptance plus an isolated reserved live-test send. | General durable carrier message/attempt outbox, real Twilio adapter, callback correlation, reconciliation, and ambiguity UI. | M5 |
| Inbound/status | Twilio form parsing, exact account + owned-destination routing, per-account signature validation, durable webhook leases, idempotency, and monotonic status updates. | Live replies, media, full keyword behavior, and complete production callback/inbox reconciliation remain. | M4 done / M6 |
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
| Verification | M1/M2 checkpoint evidence remains the production local-auth browser proof plus the fresh 40-migration/27-table boundary proof recorded in the roadmap; M3 retains its 43/36 checkpoint and 30-file/111-test public API suite. Current gates extend to 51 migrations/39 protected tables; the mandatory tenant runner is 14 files / 57 tests. M4 evidence adds encrypted-envelope/provider fixtures, safe ADMIN routes, non-owner two-account PostgreSQL signed routing, and HTTP route fixtures without claiming a literal provider-callback server E2E. | Durable carrier, production-container, backup/restore, upgrade, and release evidence remain. | M4 done; M11 pending |

## Immediate implementation order

1. Build M5 durable direct messaging without weakening the completed M4 provider trust boundary.
2. Continue through M6–M11 without treating fixture/dummy behavior as carrier-production proof.
