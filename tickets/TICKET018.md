# TICKET018 — Make Prisma query engine portable across Windows/Linux shells

- **Status:** Done
- **Priority:** P1

## Goal
Prevent environment-only runtime failures by generating Prisma client binaries for both native and Linux Debian OpenSSL 3 runtimes.

## Context
Unit tests reported `PrismaClientInitializationError` because generated clients were built for Windows runtime while bash shell checks run in Linux (`debian-openssl-3.0.x`), causing Playwright + test runs to fail after script execution.

## Scope
- **In:** `prisma/schema.prisma` (`generator client` `binaryTargets`).
- **Out:** DB migration/schema semantics and business logic changes.

## Steps
1. Add `debian-openssl-3.0.x` to `binaryTargets` in Prisma generator config.
2. Regenerate Prisma client (`npm run db:generate`).
3. Confirm unit tests pass without runtime binary mismatch.
4. Note environment-specific blockers in status handoff if e2e browser/runtime remains unsupported.

## Acceptance Criteria
- [x] `prisma/schema.prisma` includes `binaryTargets = ["native", "debian-openssl-3.0.x"]`.
- [x] `npm run db:generate` succeeds in Linux shell.
- [x] `bash scripts/agent/test.sh` reports no Prisma runtime unavailability errors.
- [x] `bash scripts/agent/typecheck.sh` still passes after schema regen.

## Commands
`npm run db:generate`, `bash scripts/agent/test.sh`, `bash scripts/agent/typecheck.sh`

## Risks
- Requires schema regen whenever Prisma version or target binaries change.
- Full `npm run validate` still depends on Playwright runtime availability (separate blocker).
