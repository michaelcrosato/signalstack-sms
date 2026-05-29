# SPEC-005 — Dependency hygiene (align carets, pin patched Redis) — NOT majors

- **Status:** Done (2026-05-29) — Redis pinned `7.4-alpine` (CVE-2025-49844) + `package.json` carets aligned to installed patched versions (within current majors); lockfile resynced via `npm install --package-lock-only` (resolved versions unchanged, no EPERM). typecheck/lint/test/build green; committed `e1565201`. Major upgrades remain in `plan/BACKLOG.md`. · **Priority:** P2 · **Pillar:** Infra · **Effort:** S

## Description
`package.json` caret minimums are far below the installed lockfile (e.g. declares `next ^15.3.2` while
`15.5.18` is installed; `react ^19.0.0` vs `19.2.6`). This understates the patched security baseline (the
critical next/react RCEs are only fixed in the *installed* versions, not the declared minimums) and
misleads `npm i` on a fresh range resolution. Also pin a Redis image patched for CVE-2025-49844. **Major
upgrades are explicitly out of scope** (see `plan/BACKLOG.md`).

## Prereqs / deps
None. DAG-independent (Phase 0). Should land before SPEC-006 (clean dep base).

## Implementation approach
1. Raise caret minimums to the installed patched versions **within current majors**: next/eslint-config-next
   `^15.5.18`, react/react-dom `^19.2.6`, prisma/@prisma/client `^6.19.3`, bullmq `^5.76.10`,
   zod `^3.25.76`, typescript `^5.9.3`, @types/node `^22.19.19`, vitest `^3.2.4`, etc.
2. `npm install` to refresh `package-lock.json`; review `npm audit` (the 2 moderate transitive postcss
   findings are acceptable until the next major — document, don't force-downgrade).
3. `docker-compose.yml`: pin `redis:7.4-alpine` (or later patched tag) for CVE-2025-49844.

## Acceptance criteria
- [ ] `package.json` minimums match installed majors; no major bumps introduced.
- [ ] `npm ci && npm run validate` green; lockfile refreshed and committed.
- [ ] `docker-compose` Redis pinned to a patched tag.
- [ ] `npm audit` shows no **new** high/critical (moderate transitive postcss documented).

## Test strategy
`npm ci` clean install; `npm run validate`; `npm audit` diff review.

## Out of scope
next 16, prisma 7, zod 4, tailwind 4, typescript 6, eslint 10, vitest 4 (each is a separate isolated
upgrade in `plan/BACKLOG.md`).
