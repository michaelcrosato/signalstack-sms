# Current State Matrix

Last updated: 2026-07-12. Governing roadmap: `docs/STANDALONE_ROADMAP.md`.

This file is intentionally compact. Historical detail belongs in Git and the standalone verification
ledger; the rows below describe current implementation truth only.

SignalStack is a strong demo-safe product foundation, not yet a standalone production SMS platform.
Built-in local identity, database-enforced tenant isolation, the public API/customer-webhook platform,
provider ownership/routing, and M5 durable direct messaging are complete and validated. Trusted inbound,
campaign execution, packaging, and recovery remain incomplete.

| Area | Backend/API State | Browser State | Main Gap | Next Action |
| --- | --- | --- | --- | --- |
| Standalone platform | Strong demo-safe foundation plus complete built-in identity, database tenant boundary, public integrations, provider ownership, and durable direct-message transport. | Seeded product, real local-auth, provider control, message-state visibility, and ADMIN ambiguity review are usable. | Trusted inbound, campaigns, packaging, and recovery are incomplete. | Execute M6–M11 in `docs/STANDALONE_ROADMAP.md`. |

| Area | Implemented now | Missing for standalone completion | Roadmap |
| --- | --- | --- | --- |
| Identity/team | Built-in scrypt credentials; keyed opaque sessions; owner bootstrap; operator create/reset CLIs; login/logout/reset; organization selection; invite/reinvite/role/suspend/revoke; fail-closed page/API auth; explicit demo-only fallback. | Optional OIDC and verified invite delivery remain adapters, not standalone requirements. | M1 done |
| Tenant database boundary | M2 completed a 40-migration/27-protected-table checkpoint; M3 reached 43/36 and M4 reached 51/39. The current 55-migration schema protects 40 tables after M5 adds the immutable `MessageAttempt` outbox, worker-only bounded dispatch/recovery, forced RLS, same-tenant provider/retry/reconciler relations, and payload/frontier triggers. | No current tenant-boundary gap. Every later tenant model and repository path must continue to join the manifest, contexts, fingerprints, and mandatory PostgreSQL matrix. | M2 boundary maintained through M5 |
| Public integrations | One-time scoped keys; bearer-only `/api/v1`; stable envelopes/errors/request IDs; HMAC cursors; PostgreSQL rates; encrypted replay; generated OpenAPI and curl/TypeScript/Python examples; atomic signed customer events. Direct message/reply acceptance now reserves permanent M5 lifecycle evidence and returns explicit application/transport/attempt/review state; acceptance itself never calls a carrier. | No current M3/M5 integration gap. Future changes must preserve the versioned compatibility and durable-before-provider contracts. | M3/M5 done |
| Provider control plane | Account-hash/AAD-bound AES-256-GCM credentials; verified account/number/service ownership; safe ADMIN lifecycle/discovery; deterministic dummy and bounded Twilio create/fetch/signature adapter; exact callback routing; canonical audit evidence. Legacy provider metadata remains unverified/display-only. | Dynamic messaging-service sender pools and campaign throughput belong to M7. | M4 maintained through M5 |
| Direct outbound | Public direct/conversation and inbox replies share transactional permanent reservation, `MessageAttempt` outbox, final-gated stored-credential Twilio SMS/MMS, bounded definitive retry, correlated callbacks, provider fetch, first-class ambiguity, cancellation, and safe ADMIN attest/retry. Dummy remains deterministic and the default. | Real carrier canary and full release proof belong to M11; campaign execution is separate M7 scope. | M5 done |
| Inbound/status | Exact account + owned-destination routing, per-account signature validation, durable webhook leases, correlated outbound status callbacks, monotonic application/attempt updates, lost-SID binding, and fetch reconciliation. | Trusted inbound media, complete STOP/START/HELP behavior, unread/search/filter/SLA, and full shared-inbox production workflow remain. | M5 outbound status done / M6 inbound |
| Campaigns/queue | Draft/preflight/schedule/cancel, durable DB jobs, owner leases, race-tested terminal transitions, optional BullMQ mirror, dummy worker. | Production live worker, final hard gate, provider throttling/backpressure, per-recipient attempts, retry/DLQ/replay, kill switch, saved audiences. | M7 |
| Contacts/audiences | Public contact/tag/list/list-membership/saved-segment CRUD and bounded segment evaluation; CSV parse/import; archive/restore/merge; ad-hoc segment query/export. | Browser administration, file mapping, suppression workflows, audience snapshots/estimates, and campaign targeting remain. | M7/M9 |
| Inbox | Demo inbound, public conversation/message reads, notes, assignment, resolve/reopen, sentiment/summary/lead signals, and M5 outbox-backed dummy/live reply acceptance with stable client retry IDs and delivery-state visibility. | Trusted production inbound, unread/search/filter/SLA, media, and safe realtime refresh remain. | M5 done / M6/M9 |
| Templates/MMS | Template CRUD and plaintext preview engine; campaign copy assistance. | Archive/versioning, preview integration, media model/storage, MMS provider path, test-send and richer campaign history. | M7/M9 |
| Compliance | Central gates, consent state/evidence constraint, double opt-in seam, quiet-hours logic, STOP/START classification, readiness profile. | Complete evidence-bearing registration/business fields, append-only consent/audit events, authoritative timezone/policy, suppression, retention and provider proof. | M8 |
| AI | Deterministic fake provider and optional gated Anthropic seam. | No hosted dependency is required; finish UX/governance only as optional value. | M9 |
| Plans/quotas | Local usage events and demo billing-account metadata. | Built-in entitlements/quotas and owner controls; optional billing adapter. | M9 |
| Analytics/ops | Product counts/delivery evidence, structured logs, local metrics, read-only operations pages. | Protected metrics, worker heartbeat, time ranges, queue/provider SLIs, alerts, audit search/export, customer reports. | M9/M10 |
| Privacy/lifecycle | Redaction helpers, secret scan, write-once consent bundle. | Message/media/webhook retention, export/delete/legal hold, cleanup jobs, complete secret scanning and audit immutability. | M8/M10 |
| Packaging | Safe Docker context, web Dockerfile, Compose for Postgres and optional Redis, demo runbooks. | Non-root standalone image, ingress/web/migration/worker/backup stack, internal networks/secrets/health/resource controls. | M0 done / M10 |
| Backup/upgrade | Prisma forward migrations and app-image rollback note. | Scheduled encrypted backups, off-host option, RPO/RTO, restore drill, pre-migration snapshot, expand/contract upgrades and rollback rehearsal. | M10 |
| Verification | M1/M2 checkpoints and M3's 43/36 public-integration proof remain. Current gates cover 55 migrations/40 protected tables; the mandatory tenant runner is 16 files/65 tests. M5 adds real-PostgreSQL permanent replay, frontier/recovery/crash, correlated callback replay/order/cross-tenant, fetch reconciliation, ADMIN attestation, and concurrent single-successor proof plus fixture-only provider tests with no carrier call. | Real carrier canary, production-container, backup/restore, upgrade, and final release evidence remain. | M5 done; M11 pending |

## Immediate implementation order

1. Build M6 trusted inbound/shared-inbox completion without weakening M5's provider/correlation boundary.
2. Continue through M7–M11 without treating fixture/dummy behavior as carrier-production proof.
