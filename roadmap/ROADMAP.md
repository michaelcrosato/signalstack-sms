# Roadmap

> **Operator: this is your file.** Plain-English bullets; reorder to change priorities. Agents only ever mark items "✅ shipped (PR #n)" — they never rewrite your words. Sections mean: **Now** = working on it, **Next** = queued, **Later** = someday, **Ideas** = unscoped thoughts.

> Derived from the 2026-06-14 engineering review (`docs/ENGINEERING_REVIEW.md`). Each item names the concrete fix and the file(s) involved so a builder can pick it up.

## Now

- **Re-wire the product gate into `scripts/verify.sh` (and CI).** The template reinstall (commit `09b87911`) overwrote `verify.sh` with a generic version that no longer calls any product check. Add steps that run `contracts:check`, `compliance:check`, `production:gate`, `production-auth:check`, `production-worker:check`, `observability:check`, `security:check`, `ai:check`, and `secrets:scan` (or call `npm run validate`) on every gate/CI run. Without this, all the items below can regress silently.
- **Fix `scripts/contracts-check.ts:226` inverted logic.** `apiDocs.some(doc => !doc.includes(endpoint))` flags an endpoint as undocumented whenever *either* doc lacks it; intent is "documented in none." Fix before re-wiring so the gate isn't a false-failure source.
- **Enforce the compliance gate on every send path.** `evaluateMessagingHardGate` must run with the recipient `contact` (and resolved `quietHours`) before any send in `dummy-provider.ts`, `twilio-provider.ts:18-23`, and the campaign worker `src/lib/queue/worker.ts:344-372`. Today opt-out / consent-evidence / quiet-hours are not enforced where it matters. Add a wired check that fails if a provider send skips the gate.

## Next

- **Strengthen `secrets-scan.ts`** to cover Twilio/Stripe/Clerk + AWS + GitHub PAT + PEM key shapes (fold in the CI inline grep) — the two scanners currently cover disjoint sets, leaving a provider-key gap.
- **Validate JWT issuer + audience** in `src/lib/auth/clerk-verifier.ts` — pass an issuer allowlist and expected `aud`; never derive the JWKS URL from an unvalidated `iss` (`clerk-verifier.ts:94`). Add a guard that production auth cannot be enabled without these set.
- **Real multi-tenant webhook routing.** Resolve the tenant from `payload.To` via `ProviderPhoneNumber` in `/api/webhooks/twilio/{inbound,status}`; stop calling demo `getOrCreateCurrentOrg()` inside webhooks; handle the no-session case without a 500. Fix the status `updateMany` (non-unique `providerMessageId`, `status/route.ts:56`) to target a unique message and add status-monotonicity.
- **Make `npm test` hermetic.** Gate the 6 ungated live-DB test files (`tests/unit/compliance/{double-opt-in,auto-responder}.test.ts`, `tests/unit/ai/sentiment-analysis.test.ts`, `tests/unit/product/segment-sync.test.ts`, `tests/unit/validation/template-preview.test.ts`, `tests/unit/observability/prometheus.test.ts`) behind `RUN_DB_TESTS`/`describe.runIf` or mock Prisma.
- **Add RBAC to ungated credential-read routes.** `settings/provider/rotations/route.ts:7` and `.../rotations/export/route.ts:8` expose the rotation audit trail to any MEMBER — gate to ADMIN to match the write side.
- **Fix CSV formula injection on export** (`contacts/segments/export/route.ts:62-68`): neutralize leading `= + - @` in cell values.

## Later

- **Make RLS real or remove the façade.** Either set `DATABASE_RLS_ENFORCED`, propagate the `tx` through all repositories (campaigns/inbox repos take no `tx`), and connect as a non-BYPASSRLS role — or delete the migration and document app-level isolation as the design. Also scope the one unscoped write (`inbox.ts:262`).
- **Add CSRF protection** for cookie-authenticated mutations, and switch CSP from `Report-Only` to enforcing (drop `unsafe-inline`) in `next.config.mjs`. Stop trusting raw `x-forwarded-for` for rate-limit keys.
- **Queue reliability primitives:** exponential backoff (`bullmq.ts:52` sets `attempts` but no `backoff`), a dead-letter queue, and job-claim locking (`SELECT … FOR UPDATE SKIP LOCKED`) to kill the DB-worker find-then-update race. Make the schedule route check the enqueue result instead of ignoring it.
- **Outbound message/segment metering** — add a `MESSAGE_OUTBOUND` `UsageEventType` and record per-segment usage on send, so billing can meter the product's core unit.
- **Clean up the git/branch hygiene** — delete the 9 stale `feat/F-*` local refs (none hold unmerged product code; F-0005/F-0006 carry only roadmap bookkeeping already reflected in develop). Adopt incremental commits; the current history is a squashed bulk dump.

## Ideas

- Wire the orphaned `analyzeConversationSentiment` AI capability to a real `/api/ai/sentiment` route (or remove the dead code) and add it to `CONTRACT-AI.md`.
- Replace ~200 frozen-array/registry "change-detector" test assertions in `tests/unit/operations/*` and `tests/unit/product/*` with behavior tests; add a coverage threshold to `vitest.config.ts`.
- Add real Stripe billing behind a `LIVE_BILLING_ENABLED` gate once metering is meaningful.
- Trim the ~470-line permanently-disabled live-worker authorizer (`live-worker-controls.ts`) down to what's actually used; the effort is disproportionate to a gated-off path.
- Add replay/freshness protection (signature timestamp window) to the Twilio webhook handlers.
