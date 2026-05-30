# SPEC-024 — Automated Contact Segment Synchronization Seam

- **Status:** Todo · **Priority:** P2 · **Pillar:** Features · **Effort:** M

## Description
Provide a dynamic contact segment builder. A segment aggregates contacts dynamically based on filters (e.g. tag names, consent status, date created, or activity score). Create a query builder repository and associated API endpoints to read dynamic segments and support synchronizing/exporting them to external systems.

## Prereqs / deps
Requires database schemas for contacts and tags (`Contact`, `Tag`, `ContactTag`).

## Implementation approach
1. Define a segment filter schema structure allowing logical `AND` / `OR` conditions for tags, consent statuses, and lead score ranges.
2. In `lib/db/repositories/segments.ts`, design a dynamic prisma query builder that translates filter parameters into a single SQL/Prisma query returning contact aggregates.
3. Expose an API endpoint `GET /api/contacts/segments` that evaluates filter JSON payloads and returns matches.
4. Support exporting matching segments directly to CSV format at `/api/contacts/segments/export`.
5. Write unit tests verifying custom query parameters, multiple conditions, and clean fallbacks.

## Acceptance criteria
- [ ] Segment query builder successfully compiles nested filters to database queries.
- [ ] Endpoint `/api/contacts/segments` returns correct tenant-scoped contacts matching dynamic tag/consent filters.
- [ ] Endpoint `/api/contacts/segments/export` serves standard compliant CSV files.
- [ ] Unit tests cover multiple filter scenarios and blank database matches.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests under `tests/unit/product/segment-sync.test.ts` verifying SQL/Prisma compiler output, filter validation, and CSV format compliance.
