# TICKET028 — Single-package Docker bundle & backup/restore

- **Milestone:** M10
- **Status:** Done
- **Priority:** P1

## Goal
Package SignalStack SMS into a production-grade, single-package self-hosted Docker distribution with Caddy TLS ingress, Next.js web application, PostgreSQL container with RLS policies, background worker container, encrypted backup/restore CLI, and zero external runtime dependencies.

## Context
Docker Compose definitions currently support development Postgres/Redis services (`docker-compose.yml`). M10 produces the release-ready multi-stage Docker build, production compose profiles, non-root application execution, volume encryption guidance, automated database backup/restore harness, and upgrade/rollback runbook.

## Scope
- **In:** Production Dockerfile with pinned Node 22 runtime, non-root user execution, `.dockerignore` context isolation, production `docker-compose.prod.yml`, Caddy reverse proxy profile with automatic TLS, `pg_dump`/`pg_restore` backup & restore verification script, upgrade expand/contract migration procedures.
- **Out:** Cloud-provider proprietary deployment scripts; external container registries.

## Likely files
`Dockerfile`, `.dockerignore`, `docker-compose.yml`, `scripts/docker-context-check.ts`, `docs/PRODUCTION_DEPLOYMENT.md`, `docs/LOCAL_OPERATOR_RUNBOOK.md`.

## Acceptance criteria
- [x] Multi-stage Docker image builds with zero build-cache or secret leakage (`docker:context:check` passes).
- [x] Service boots on a clean host using compose with read-only root filesystem where applicable.
- [x] Database backup command produces an encrypted, verifiable backup file.
- [x] Restore drill successfully recovers database state on a clean instance without data loss.
- [x] Healthcheck endpoints respond with correct status for web and worker containers.

## Commands
`npm run docker:context:check`, `npm run standalone:check`, `npm run validate`
