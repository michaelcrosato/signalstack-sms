# TICKET029 — Release proof & carrier canary

- **Milestone:** M11
- **Status:** Done
- **Priority:** P1

## Goal
Execute full end-to-end integration verification, production build validation suite, security vulnerability scan, database recovery rehearsal, operator canary send verification, and generate signed release proof.

## Context
M11 is the final milestone in the Standalone Zero-SaaS Roadmap. It validates that every milestone (M0–M10) meets exit criteria, runs the complete test matrix across unit, tenant-db, API, webhook, and browser E2E suites, verifies human-gated carrier canary safety, and updates `docs/standalone-verification.json` with final authoritative evidence.

## Scope
- **In:** Full production build E2E test execution, carrier canary checklist with cost caps, multi-tenant Postgres isolation verification, secrets scan, license compliance, production gate verification, signed milestone release proof ledger.
- **Out:** Unapproved live carrier sends in automated CI.

## Likely files
`scripts/validate.ts`, `scripts/production-gate.ts`, `scripts/standalone-roadmap-check.ts`, `docs/standalone-verification.json`, `docs/STANDALONE_ROADMAP.md`, `ROADMAP.md`.

## Acceptance criteria
- [x] Every milestone M0–M11 in `docs/STANDALONE_ROADMAP.md` and `docs/standalone-verification.json` is marked `done` with verifiable evidence.
- [x] Full `npm run validate` suite exits 0 without warnings or skipped security checks.
- [x] Carrier canary send execution is documented with explicit cost caps and human authorization.
- [x] Production deployment and backup recovery drills pass on clean target infrastructure.
- [x] Standalone roadmap check (`npm run standalone:check`) passes cleanly.

## Commands
`npm run standalone:check`, `npm run production:gate`, `npm run validate`
