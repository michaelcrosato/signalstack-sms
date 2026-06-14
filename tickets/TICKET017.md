# TICKET017 — AFK shell wrapper portability and explicit agent scripts

- **Status:** Done
- **Priority:** P1
- **Context:** Bash helpers assumed npm and missed explicit `agent:*` package aliases, reducing portability across environments.

## Goal
Make agent shell wrappers runtime-portable by detecting package manager and exposing missing `agent:*` scripts in `package.json`.

## Scope
- **In:** `scripts/agent/_common.sh`, `scripts/agent/bootstrap.sh`, `package.json`.
- **Out:** app/infra features, test/business logic changes.

## Steps
1. Add package-manager detection in `scripts/agent/_common.sh` (`npm`/`pnpm`/`yarn` fallback path).
2. Route package manager install + script execution through that detector.
3. Update bootstrap to use shared install helper.
4. Add `agent:*` script aliases (`agent:bootstrap`, `agent:doctor`, `agent:check`, `agent:test`, `agent:lint`, `agent:typecheck`, `agent:format`) in `package.json`.

## Acceptance Criteria
- [x] `scripts/agent/*.sh` no longer assume npm unconditionally.
- [x] `package.json` includes `agent:bootstrap`, `agent:doctor`, `agent:check`, `agent:test`, `agent:lint`, `agent:typecheck`, `agent:format`.
- [x] `bash scripts/agent/bootstrap.sh` logs install action using detected package-manager helper.
- [x] `bash scripts/agent/lint.sh` and `bash scripts/agent/typecheck.sh` still execute successfully after changes.

## Commands
`bash scripts/agent/lint.sh`, `bash scripts/agent/typecheck.sh`, `bash scripts/agent/test.sh`

## Risks
- CI currently invokes bash wrappers through Linux, but local developer shells may vary; fallback default remains npm.

## Notes
No external behavior changed; this is an AFK ergonomics and portability fix.
