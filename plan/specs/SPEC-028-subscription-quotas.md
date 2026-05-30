# SPEC-028 — Multi-Tenant Subscription Tier & Quota Seam

- **Status:** Todo · **Priority:** P1 · **Pillar:** Features · **Effort:** M

## Description
Provide subscription tier enforcement and dynamic quota management. To model monetization and prevent abuse, organizations should belong to one of three billing plans (FREE, GROWTH, ENTERPRISE) with enforced quotas on contact limits and monthly messages.

## Prereqs / deps
Requires database models and messaging preflight gates.

## Implementation approach
1. Add an optional/nullable `subscriptionTier` field to the `Organization` model in `prisma/schema.prisma` (enum or string, defaulting to `FREE` via migration).
2. Create `lib/billing/quotas.ts` containing the quota thresholds and checkers:
   - `FREE`: 50 contacts, 100 messages/month
   - `GROWTH`: 500 contacts, 1000 messages/month
   - `ENTERPRISE`: Unlimited
3. Wire contact limit checks inside contact creation routes (`app/api/contacts/route.ts` and `lib/csv/import-contacts.ts`). If the organization exceeds its plan quota limit, reject creation with a standard tenant-safe `402 Payment Required` or compliance exception.
4. Enforce monthly message dispatch limits in campaign queues and direct sends, checking database counts.
5. Create a REST endpoint GET `/api/billing/usage` returning the organization's current contact and message consumption totals and percentages.
6. Cover with unit tests validating limit enforcement, CSV rejections, and correct usage percentage returns.

## Acceptance criteria
- [ ] Organizations default to the `FREE` tier.
- [ ] Creating contacts beyond the tier limit is rejected safely.
- [ ] Monthly messaging usage limits block campaign sends when exceeded.
- [ ] Exposes a functional `/api/billing/usage` usage monitoring API.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/billing/quotas.test.ts` verifying limits, database interactions, and API response payload formats.
