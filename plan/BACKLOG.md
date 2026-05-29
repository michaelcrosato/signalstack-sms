# plan/BACKLOG.md — future-only ideas (do NOT execute from here)

Parking lot for out-of-scope ideas. Nothing here is approved work. Promote an item to a
`plan/specs/SPEC-NNN.md` (and into `plan/ROADMAP.md`) only when it becomes in-scope. Keeps the active plan
free of creep.

## Major dependency upgrades (each = its own isolated branch + full gate + visual check)
- **Next.js 15 → 16** — caching model overhaul (`use cache` / Cache Components, PPR default),
  `middleware.ts` → `proxy.ts`, `revalidateTag` signature change. Needs a full caching + auth audit.
- **Prisma 6 → 7** (latest 7.7+) — Rust-free architecture; **driver adapters are now mandatory** (pick
  one, e.g. `@prisma/adapter-pg`), which intersects the SPEC-010 RLS + pooling decision. Re-validate
  pooling, the RLS extension, and `$transaction` behavior under the adapter.
- **Zod 3 → 4** — breaking (`.merge`→`.extend`, `nativeEnum`→`enum`, string-format API); touches every
  boundary/validation + server action. Codemod available.
- **Tailwind 3 → 4**, **TypeScript 5 → 6**, **ESLint 9 → 10**, **Vitest 3 → 4** — independent breaking
  upgrades; sequence one at a time.

## Product / feature ideas (competitive, from research)
- RCS messaging support (rich cards, branded sender).
- Integrated voice/calling on the same number/inbox (Salesmsg-style).
- Predictive / behavioral segmentation + revenue attribution (Klaviyo-style moat for SMB).
- Native CRM sync (HubSpot/Salesforce) beyond CSV import.
- Autonomous two-way conversation automation (AI Concierge) — beyond review-before-send drafts.
- SPEC-007 follow-ups: extend the `AiProvider` seam to the other 3 AI endpoints (campaign-copy + summary;
  lead-qualification is SPEC-008); broaden prompt PII redaction beyond phone-like runs (names/emails) if
  real PII enters message bodies; write the human-only live-AI enablement runbook (set `AI_PROVIDER=live` +
  `LIVE_AI_ENABLED` + `AI_API_KEY` + `AI_COST_ACK`, with cost monitoring); optional streaming/multi-model routing.
- Double opt-in + sign-up unit / keyword growth tooling.
- Per-US-state quiet-hour variants (FL/OK/WA 8–8, TX 9–9) beyond the core 8am–9pm rule.
- SPEC-009 follow-up: write-once immutability of stored consent evidence (DB/app guard so captured evidence can't be silently altered); per-contact timezone resolution for quiet hours.
- SPEC-008 follow-up: surface the lead score in the inbox workspace too (the contact detail page is done); optional auto-routing/assignment on score (out of scope).

## Infra / platform ideas
- Real Stripe billing (live, behind cost + data-use hard gate).
- Redis-backed distributed rate limit + queue execution in production (replace in-memory limiter).
- Next standalone output for a smaller Docker image; deploy automation; branch protection + real automerge.
- Prisma Accelerate / PgBouncer transaction-mode pooling for serverless.
- SPEC-010 RLS **production enablement**: point the app at a non-superuser DB role and adopt `withTenantRls` on request paths so RLS enforces at runtime (it currently enforces only via the helper, proven by the gated test); pair with the pooling decision above.
- BullMQ Prometheus metrics export + stalled-job alerting in production.
- OpenTelemetry **exporter** wiring (`@vercel/otel` `registerOTel`) behind the `instrumentation.ts` seam (SPEC-006 left the seam + PII-safe logger; exporter needs a backend choice + dependency install).

## Notes
Anything an executing agent discovers that is out-of-scope for its current spec goes **here**, not into the
working change.
