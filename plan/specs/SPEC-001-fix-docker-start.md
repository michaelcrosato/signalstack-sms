# SPEC-001 — Fix Docker runtime: missing `start` script

- **Status:** Done (2026-05-28) — added `"start": "next start"`; verified `npm start` boots (Ready in 288ms, `GET /` → 200). · **Priority:** P1 · **Pillar:** Fixes · **Effort:** XS

## Description
`Dockerfile` ends with `CMD ["npm", "start"]`, but `package.json` defines **no `start` script**. A built
image therefore fails at container start with `npm error Missing script: "start"`. Next.js production
serving requires `next start`.

## Prereqs / deps
None. DAG-independent (Phase 0).

## Implementation approach
1. Add `"start": "next start"` to `package.json` scripts (optionally `next start -p ${PORT:-3000}`).
2. Confirm the Dockerfile build→run path: `next build` output is served by `next start`.
3. (Optional, note only) Consider `output: "standalone"` in `next.config.mjs` for a smaller image — defer
   to BACKLOG; out of scope here.

## Acceptance criteria
- [ ] `package.json` has a `start` script invoking `next start`.
- [ ] `npm run build && npm run start` serves locally; `GET /api/health` returns 200.
- [ ] `docker build .` succeeds and the container starts without "Missing script" (or, if Docker is
      unavailable in the sandbox, document as "not run — verified by build-path inspection").
- [ ] `npm run validate` remains green.

## Test strategy
Manual: `npm run build` then `npm run start`, curl `/api/health`. If Docker present: `docker build -t ss .`
then `docker run --rm -p 3000:3000 ss` and curl. Record honestly if Docker not available.

## Out of scope
Standalone-output optimization, multi-arch images, a compose `app` service, deploy automation.
