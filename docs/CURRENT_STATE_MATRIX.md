# Current State Matrix

Last updated: 2026-07-10. Governing roadmap: `docs/STANDALONE_ROADMAP.md`.

This file is intentionally compact. Historical detail belongs in Git and the standalone verification
ledger; the rows below describe current implementation truth only.

SignalStack is a strong demo-safe product foundation, not yet a standalone production SMS platform.
Built-in local identity and database-enforced tenant isolation are complete and validated; provider
routing, durable external sends, public integrations, packaging, and recovery remain incomplete.

| Area | Backend/API State | Browser State | Main Gap | Next Action |
| --- | --- | --- | --- | --- |
| Standalone platform | Strong demo-safe domain/queue foundation plus complete built-in identity and database tenant boundary. | Seeded product and real local-auth workflows are usable. | Integrations, carrier execution, packaging, and recovery are incomplete. | Execute M3/M4, then M5–M11 in `docs/STANDALONE_ROADMAP.md`. |

| Area | Implemented now | Missing for standalone completion | Roadmap |
| --- | --- | --- | --- |
| Identity/team | Built-in scrypt credentials; keyed opaque sessions; owner bootstrap; operator create/reset CLIs; login/logout/reset; organization selection; invite/reinvite/role/suspend/revoke; fail-closed page/API auth; explicit demo-only fallback. | Optional OIDC and verified invite delivery remain adapters, not standalone requirements. | M1 done |
| Tenant database boundary | Fresh 40-migration/no-diff install under a non-superuser/non-BYPASSRLS table owner using `signalstack_owner`; owner capability barred from runtimes; same-tenant composite FKs and historical-reference triggers; PII-free aborting preflight; 27-table forced RLS with semantic fingerprints; NOINHERIT web/worker logins; exact command-specific control policies; atomic database-timed dispatch with no public ACL; zero tenant migration-debt imports; mandatory two-tenant matrix. | No M2 gap. New tenant models and repository paths must join the manifest, contexts, fingerprints, and mandatory matrix. | M2 done |
| Public integrations | Internal browser JSON routes and provider callback routes. | Scoped API keys, `/api/v1`, OpenAPI, pagination/errors, SDK examples, outbound signed webhook outbox/retry/replay. | M3 |
| Provider control plane | Dummy provider; redacted Twilio metadata/rotation history; local number metadata; isolated env-backed live test. | Encrypted recoverable secrets, account/number verification, globally unique ownership, provider factory, trusted tenant routing, health. | M4 |
| Direct outbound | Dummy inbox reply and isolated reserved live-test send. | General durable message/attempt outbox, public send API, real Twilio adapter, callback correlation, reconciliation, ambiguity UI. | M5 |
| Inbound/status | Twilio form parsing/signatures, durable webhook leases, idempotency, monotonic status updates. | Resolve account + destination to one tenant, tenant credential validation, live replies, media, full keyword behavior, customer events. | M6 |
| Campaigns/queue | Draft/preflight/schedule/cancel, durable DB jobs, owner leases, race-tested terminal transitions, optional BullMQ mirror, dummy worker. | Production live worker, final hard gate, provider throttling/backpressure, per-recipient attempts, retry/DLQ/replay, kill switch, saved audiences. | M7 |
| Contacts/audiences | Contact lifecycle, tags/lists in schema, CSV parse/import, archive/restore/merge, ad-hoc segment query/export. | First-class tag/list/saved-segment APIs/UI, file mapping, suppression workflows, audience snapshots/estimates and campaign targeting. | M7/M9 |
| Inbox | Demo inbound/reply, notes, assignment, resolve/reopen, sentiment/summary/lead signals. | Trusted production inbound/live replies, real team administration, unread/search/filter/SLA, media, safe refresh and customer events. | M6/M9 |
| Templates/MMS | Template CRUD and plaintext preview engine; campaign copy assistance. | Archive/versioning, preview integration, media model/storage, MMS provider path, test-send and richer campaign history. | M7/M9 |
| Compliance | Central gates, consent state/evidence constraint, double opt-in seam, quiet-hours logic, STOP/START classification, readiness profile. | Complete evidence-bearing registration/business fields, append-only consent/audit events, authoritative timezone/policy, suppression, retention and provider proof. | M8 |
| AI | Deterministic fake provider and optional gated Anthropic seam. | No hosted dependency is required; finish UX/governance only as optional value. | M9 |
| Plans/quotas | Local usage events and demo billing-account metadata. | Built-in entitlements/quotas and owner controls; optional billing adapter. | M9 |
| Analytics/ops | Product counts/delivery evidence, structured logs, local metrics, read-only operations pages. | Protected metrics, worker heartbeat, time ranges, queue/provider SLIs, alerts, audit search/export, customer reports. | M9/M10 |
| Privacy/lifecycle | Redaction helpers, secret scan, write-once consent bundle. | Message/media/webhook retention, export/delete/legal hold, cleanup jobs, complete secret scanning and audit immutability. | M8/M10 |
| Packaging | Safe Docker context, web Dockerfile, Compose for Postgres and optional Redis, demo runbooks. | Non-root standalone image, ingress/web/migration/worker/backup stack, internal networks/secrets/health/resource controls. | M0 done / M10 |
| Backup/upgrade | Prisma forward migrations and app-image rollback note. | Scheduled encrypted backups, off-host option, RPO/RTO, restore drill, pre-migration snapshot, expand/contract upgrades and rollback rehearsal. | M10 |
| Verification | Unit suite: 150 files pass / 13 skip, 1,078 tests pass / 61 skip; database suite: 37 files / 186 pass; mandatory tenant gate: eight files / 33 pass; focused auth database run: nine files / 38 pass; fresh 40-migration/no-diff proof; smoke browser, production local-auth build/browser 1/1 under a non-owner login, and adversarial M1 audit. | Mandatory public API/provider/container/restore E2E and release evidence remain. | M11 |

## Immediate implementation order

1. Build M3 public integration identity/events and M4 provider ownership/secrets in parallel.
2. Continue through M5–M11 without treating demo-only behavior as completion proof.
