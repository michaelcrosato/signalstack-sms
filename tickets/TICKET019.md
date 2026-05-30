# TICKET019 — Update AFK onboarding docs for agent script portability

- **Status:** Done
- **Priority:** P2

## Goal
Keep immediate AFK operator guidance aligned with current tooling by documenting new `agent:*` entrypoints and validation caveats.

## Context
After script hardening, the repo docs were missing explicit `agent:*` command references and browser-install caveats for Linux validation paths.

## Scope
- **In:** `AGENTS.md`, `README.md`.
- **Out:** core plan/contract content and feature code.

## Steps
1. Add `agent:*` script aliases to AGENTS command reference.
2. Update README quick-start and validation notes for `agent:bootstrap`/`agent:check` and Playwright browser install behavior.
3. Verify instructions remain minimal and actionable.

## Acceptance Criteria
- [x] `AGENTS.md` command reference includes the new `agent:*` wrappers.
- [x] `README.md` includes `agent:bootstrap` / `agent:check` examples and the Playwright browser-install note.
- [x] No behavior changes required outside documentation.

## Commands
`bash scripts/agent/status.sh`

## Risks
- Low; docs-only change, but stale docs reduce agent orientation over time.
