# Compliance Contract

Owner: backend-data and tests-quality.

Milestone 0 hard gates:

- Live messaging disabled by default.
- Live billing disabled by default.
- Dummy messaging provider by default.
- Fake AI provider by default.
- Shared demo-safe runtime defaults are runtime-frozen before local UI, health, and compliance checks consume them.
- No real credentials committed.

Future campaign sends must check consent, opt-out state, provider readiness, and live-action flags.

Milestone 2 contact storage rules:

- `OPTED_OUT` contacts must retain `optedOutAt`.
- `OPTED_IN` contacts should retain `optInAt` and `optInSource` when available.
- CSV import is local-only and must not send messages or notify contacts.
- Contact deletion is soft archive only during the MVP foundation.
- Stored consent evidence (`consentCapturedAt`, `consentMethod`, `consentDisclosure`) is an atomic, write-once bundle. A contact has either all three non-empty evidence values or none. Once captured, any subsequent update that attempts to change or clear the bundle must be rejected by application checks and database invariants; concurrent writers cannot replace or combine separate capture attempts.
- Partial contact updates must not change consent status merely because double opt-in is enabled.
- Contact merges and inbound opt-in keywords must never produce an `OPTED_IN` contact without a complete timestamp, method, and disclosure; existing complete evidence is preserved and incomplete evidence fails closed.

Milestone 3 preflight rules:

- Empty recipient sets are blocked.
- Missing or cross-tenant requested contact IDs are blocked as `CONTACT_NOT_FOUND`.
- Archived contacts are blocked.
- Contacts not explicitly `OPTED_IN` are blocked.
- Opted-out contacts are blocked.
- Preflight does not schedule, enqueue, or send messages.

Milestone 5 inbound rules:

- Demo inbound APIs create local message records only.
- Explicit local inbound idempotency duplicates must be detected before contact, conversation, timestamp, or opt-out mutations repeat.
- Inbound messages are persisted before keyword consent effects or any demo-only confirmation row. Confirmation idempotency keys derive from the inbound idempotency key so retries cannot create another dummy response.
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, and QUIT update the local contact to `OPTED_OUT` and set `optedOutAt`.
- HELP and INFO are recorded as inbound help keywords but do not opt a contact in and do not send a live or dummy outbound response yet.
- Signed provider webhooks apply keyword consent effects without creating dummy confirmation replies and without invoking conversation sentiment analysis.
- Inbox assignment, notes, resolve, and reopen operations are tenant-scoped.

M5 direct-message hard gate rules:

- API/inbox acceptance may perform a recipient preflight, but it does not authorize carrier impact. The
  direct worker must reload and evaluate every mutable input immediately before its durable provider-call
  frontier. Passing an earlier preflight, provider setup screen, or readiness summary is not send authority.
- The centralized messaging hard gate blocks unless `LIVE_MESSAGING_ENABLED=true`, `DEMO_MODE=false`, and
  `MESSAGING_PROVIDER=twilio`. Missing, blank, malformed, or case-drifted live configuration fails closed.
- The complete current compliance profile and `APPROVED` A2P status are required.
- The fresh contact must remain in the same tenant, not archived, explicitly `OPTED_IN`, not opted out or
  pending double opt-in, and retain the complete write-once consent evidence bundle. A contact phone edit
  cannot retarget an already accepted message; a mismatch from the snapshotted destination blocks the call.
- The current authoritative contact timezone/state policy must permit sending at the database-backed worker
  decision time. Quiet hours are a policy-bounded no-call outcome and cannot be bypassed by an API, retry,
  reconciliation, or operator action.
- The final gate also requires the attempt's exact M4 account to remain verified and unrevoked, its credential
  generation active, its sender number verified/enabled/owned by that account and organization, and its
  SMS/MMS capability compatible with the immutable payload. Disable, revoke, rotation, opt-out, archive, and
  quiet-hours races are resolved by conditional database transitions before provider mutation.
- Only the exact `production-live-direct` worker class may execute an M5 live create, and the default worker
  profile authorizes no live direct or campaign mutation. Installation-global live-test credentials do not
  satisfy the general direct-message gate.
- Reconciliation is provider fetch only and never sends. ADMIN `NOT_SENT` attestation and retry cannot bypass
  the gate; a successor attempt is checked again when its worker reaches the provider-call frontier.
- `dummy` remains deterministic and network-free and does not pass the live gate. It may produce local outbox
  evidence without pretending that compliance/provider readiness is production proof.

Campaign send-time hard gate rules remain deferred to M7. Existing local scheduled-campaign workers continue
to recheck recipient consent, opt-out, and archive state and remain dummy-only; M5 direct-worker authorization
must not authorize `production-live-campaign`.

Post-MVP live-readiness audit rules:

- Compliance profile updates record local `LiveReadinessAuditEvent` rows.
- Provider phone-number metadata changes record local `LiveReadinessAuditEvent` rows.
- Audit listing and export filters must be bounded and tenant-scoped.
- Audit listing and export default and maximum limits must come from the readiness-audit operations vocabularies.
- Audit events and audit exports must not expose secrets, send notifications, call providers, call billing systems, mutate records, or enable live messaging.

Post-MVP compliance detail view:

- `/settings/compliance` renders existing compliance profile and hard-gate readiness data only.
- It may show missing profile fields, A2P metadata status, blockers, and links to existing local audit exports.
- It must not update compliance metadata, verify provider registration, call providers, send notifications, create billing records, expose secrets, or enable live messaging.
