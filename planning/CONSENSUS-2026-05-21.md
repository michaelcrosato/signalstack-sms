# Planning Consensus - 2026-05-21

Inputs reviewed:

- `planning/claude-session-2026-05-21.md`
- `planning/gemini-session-2026-05-21.md`
- `planning/grok-session-2026-05-21.md`
- Current repo state, canonical plan, contracts, local gate, and recently verified live-test SMS path.

## Shared Diagnosis

The repo is safer and more complete below the UI than above it. Contracts, tenant boundaries, validation gates, seed data, local worker behavior, provider metadata, and operations visibility are strong. The product-facing workflow is the weak point: an investor or SMB owner still cannot use a polished browser path for contacts, campaigns, inbox, templates, analytics, and compliance.

## Model-Specific Takeaways

Claude's plan is strongest on production correctness. The most important warnings are RBAC not being consistently enforced on mutating routes, send-time consent needing rechecks, idempotency needing tenant-aware scoping, and the need to reduce scaffolding noise.

Gemini's plan is strongest on proving real provider value. The repo now has an explicitly gated live-test SMS path, so the immediate investor proof exists. That should not become a shortcut to full live campaign sending before compliance, auth, worker, and provider controls are ready.

Grok's plan is strongest on product direction. The operations console should remain useful, but the next major effort should be a product-first UI and demo path that a non-developer can drive.

Codex's judgment is to combine those positions: preserve hard gates, stop expanding read-only operations breadth, fix the highest-risk backend correctness gaps, and build the product UI.

## Consensus Roadmap

1. Truth and stabilization:
   - Keep `PLAN.md` short.
   - Maintain `docs/CURRENT_STATE_MATRIX.md`.
   - Preserve the canonical implementation plan and contracts.
   - Fix RBAC enforcement, send-time consent rechecks, and tenant-aware idempotency.

2. Product UI investor demo:
   - Add `/dashboard` as the primary product shell.
   - Build contacts, campaigns, inbox, templates, analytics, and compliance flows on existing APIs.
   - Add a product-demo Playwright path.
   - Keep `/settings/**` as operator/admin surfaces, not the main product.

3. Controlled live readiness:
   - Keep the isolated live-test SMS path for demos.
   - Harden Twilio campaign sending only after auth, compliance, worker, observability, and secret controls are in place.
   - Keep live billing and live AI blocked until explicit cost and data-use gates exist.

4. Production SaaS:
   - Add Stripe, live AI, A2P operational workflows, production observability, and scale work after the product path is usable.

## Immediate Next Work

- Build the `/dashboard` product shell.
- Add the product-demo E2E test.
- Fix mutating-route RBAC enforcement.
- Add send-time consent recheck tests and implementation.
- Scope idempotency behavior by tenant where appropriate.
