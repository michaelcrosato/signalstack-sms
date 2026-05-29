# SPEC-004 — Rewrite README as a human quick-start (drop deleted-page bloat)

- **Status:** Done (2026-05-28) — README rewritten to 54 lines (human quick-start), zero deleted-page refs; gate green. · **Priority:** P1 · **Pillar:** Fixes/Docs · **Effort:** S

## Description
`README.md` is stale and bloated. ~70 of its lines describe `/settings` pages **deleted in ULTRAPLAN
Phase A** (reports, workflows, releases, integrations, team, billing, ai, numbers, system, usage, data,
audience, templates, inbox, webhooks, campaigns, contacts, notifications, demo, contracts, environment,
api) plus dense agent/operations minutiae. The repo standard (and prior goal) is: **README = human
quick-start; keep agent instructions out** (those live in `AGENTS.md` + `docs/ai/REPO_MAP.md`).

## Prereqs / deps
None. DAG-independent (Phase 0). Verify no gate asserts README body (operator/platform checks) before
trimming.

## Implementation approach
1. Replace with a concise (~50–70 line) README: one-paragraph what-it-is; demo-safe defaults block;
   install (`bash scripts/agent/bootstrap.sh`); run (`npm run dev`, `build`); test/gate
   (`npm run validate`, e2e prerequisites); env (point to `.env.example`); and a "Docs" section linking
   `GOAL.md`, `ROADMAP.md`, `AGENTS.md`, `docs/ai/REPO_MAP.md`, `tickets/`, `plan/`.
2. Remove every per-`/settings`-page paragraph and the frozen-metadata prose. Reflect the real surface
   (10 dashboard pages, 10 settings pages + index, `/demo`).

## Acceptance criteria
- [ ] README ≤ ~70 lines; no mention of any deleted `/settings` page.
- [ ] Links to canonical docs + `plan/`; no duplicated agent-loop instructions.
- [ ] `grep` for deleted page names in README returns nothing.
- [ ] `npm run validate` green (confirm `operator:check`/`platform:check` don't depend on README body).

## Test strategy
`npm run validate`; `grep -E "settings/(reports|workflows|releases|integrations|team|billing|ai|numbers|
system|usage|data|audience|templates|inbox|webhooks|campaigns|contacts|notifications|demo|contracts|
environment|api)" README.md` → empty.

## Out of scope
Screenshots, badges, CONTRIBUTING, marketing copy.
