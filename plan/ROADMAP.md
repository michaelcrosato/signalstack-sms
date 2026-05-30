# Transformation ROADMAP (plan/)

Research-informed transformation master for SignalStack SMS. **Additive** to the canonical
`ROADMAP.md` (near-term AFK ops) and `docs/ai/ULTRAPLAN.md` (strategic product overlay) — it does not
replace them. Rationale + citations: `plan/CONTEXT.md`. Each item maps to a `plan/specs/SPEC-NNN.md` or
an existing `tickets/TICKETNNN.md`. Execute via `plan/AGENTS.md`; track in `plan/PROGRESS.md`.

> RISK (duplication): the repo already owns `ROADMAP.md`, `AGENTS.md`, `docs/RISK_REGISTER.md`. This
> `plan/` layer is intentionally additive (net-new specs + research). `plan/AGENTS.md` is a thin pointer
> to `/AGENTS.md`; `plan/RISK_REGISTER.md` references `docs/RISK_REGISTER.md`. Do not fork canonical docs.

## Pillars
- **Fixes** — correctness bugs found by ground truth (SPEC-001, SPEC-004).
- **Infra/CI** — make the gate real end-to-end (SPEC-002, SPEC-005).
- **Security/Quality** — headers/CSP, observability (SPEC-003, SPEC-006).
- **Product** — auth + inbox (existing TICKET009, TICKET003).
- **Features** — real AI behind gates; compliance depth (SPEC-007, SPEC-008, SPEC-009).
- **Future-proofing** — RLS, major upgrades (SPEC-010, `plan/BACKLOG.md`).

## Priority matrix
Scores 1–5, **higher is better**: Impact (value), Feasibility (ease/small blast radius), Safety
(low risk of breakage/external impact), Fit (aligns with demo-safe + hard-gate doctrine). Composite = sum.

| ID | Title | Pillar | Impact | Feas | Safety | Fit | Σ | Why (terse) |
| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| SPEC-001 | Fix Docker `start` (next start) | Fixes | 3 | 5 | 5 | 4 | **17** | 1-line; image is currently unrunnable |
| SPEC-002 | CI Postgres+Redis services | Infra | 4 | 4 | 5 | 5 | **18** | makes `validate` (e2e) actually verify in CI |
| SPEC-003 | Security headers + CSP baseline | Sec/Qual | 4 | 4 | 4 | 5 | **17** | zero headers today; standard hardening |
| SPEC-004 | Rewrite README (human quick-start) | Fixes | 3 | 5 | 5 | 4 | **17** | describes 23 deleted pages; misleads humans |
| SPEC-005 | Dependency hygiene (carets + Redis pin) | Infra | 3 | 5 | 4 | 4 | **16** | align package.json to installed; pin patched Redis |
| SPEC-009 | Compliance: quiet-hours + consent evidence | Features | 5 | 3 | 4 | 5 | **17** | legally required to ever go live |
| SPEC-006 | Observability (OTel + PII-safe logs) | Sec/Qual | 4 | 3 | 4 | 4 | **15** | required before prod PII handling |
| SPEC-007 | Real AI reply drafting (gated) | Features | 5 | 3 | 3 | 4 | **15** | 2026 table-stakes; review-before-send |
| SPEC-008 | Real AI lead qualification (gated) | Features | 5 | 2 | 3 | 4 | **14** | differentiator; depends on AI seam |
| SPEC-010 | Postgres RLS defense-in-depth | Future | 4 | 2 | 2 | 4 | **12** | DB-enforced isolation; pooling/txn risk |
| TICKET009 | Clerk auth/RBAC slice (gated) | Product | 5 | 3 | 3 | 5 | — | biggest unlock; enablement needs human secrets |
| TICKET003 | Demo-safe inbox reply | Product | 4 | 4 | 5 | 5 | — | fully unblocked product gap |
| SPEC-011 | Inbox lead-score surfacing | Product | 3 | 5 | 5 | 5 | **18** | completes SPEC-008 visibility; render-verifiable |
| SPEC-012 | AI seam for campaign-copy + summary | Features | 3 | 4 | 4 | 4 | **15** | consistency; finishes the AI seam (gated) |
| SPEC-013 | Per-US-state quiet-hour variants | Features | 4 | 4 | 4 | 5 | **17** | compliance depth; pure logic, no migration |
| SPEC-014 | Consent-evidence write-once immutability | Features | 4 | 4 | 4 | 5 | **17** | TCPA defensibility; app-level guard |
| SPEC-015 | Delivery/queue/webhook metrics counters | Sec/Qual | 4 | 4 | 4 | 4 | **16** | observability depth; flag-gated, no PII |
| SPEC-016 | BullMQ Worker production hardening | Infra | 4 | 4 | 4 | 4 | **16** | grace close, custom lock durations, error hooks |
| SPEC-017 | Phone Number Lookup Validation Seam | Quality | 4 | 3 | 4 | 5 | **16** | sanitization and formatting at input/CSV boundaries |
| SPEC-018 | Distributed Redis-Backed Rate Limiter | Quality | 4 | 4 | 4 | 5 | **17** | Replace in-memory rate limiter with Redis, safe fallback |
| SPEC-019 | OpenTelemetry Exporter Integration | Quality | 4 | 4 | 5 | 4 | **17** | Wire vercel/otel exporter under root instrumentation |
| SPEC-020 | PostgreSQL RLS Production Enablement | Future | 4 | 3 | 3 | 5 | **15** | Run queries wrapped in withTenantRls using app_rls |
| SPEC-021 | Double Opt-In Workflow Seam | Features | 4 | 4 | 4 | 5 | **17** | transitional PENDING_DOUBLE_OPT_IN state + request SMS |
| SPEC-022 | Prometheus Metrics Exporter API | Quality | 4 | 4 | 5 | 4 | **17** | plaintext exposition metrics format endpoint at /api/metrics |
| SPEC-023 | TCPA Opt-Out Auto-responder Seam | Features | 5 | 4 | 4 | 5 | **18** | Automate STOP opt-outs and confirm SMS auto-replies |
| SPEC-024 | Segment Synchronization Seam | Features | 4 | 4 | 4 | 5 | **17** | Dynamic query filter contact segment aggregates |
| SPEC-025 | Template Render Validator | Quality | 4 | 4 | 5 | 5 | **18** | Parse placeholder variable substitutions and preview rendered copy |
| SPEC-026 | Sentiment Analysis Seam | Features | 4 | 4 | 4 | 4 | **16** | AI-driven sentiment and classification mapping on inbox |

## DAG (dependencies)
```
Phase 0 (independent quick wins — parallel-safe, separate worktrees):
  SPEC-001 ─┐
  SPEC-004 ─┤  no deps
  SPEC-002 ─┤
  SPEC-005 ─┘
  SPEC-003 ─┘

Phase 1 (product backbone):
  TICKET003 (inbox reply)        no deps → unblocked NOW
  TICKET009 (Clerk auth) ── enablement needs human Clerk secrets (hard gate); slice buildable

Phase 2 (quality + compliance, build on Phase 0/1):
  SPEC-006 (observability) ── after SPEC-005 (clean deps)        ; informs SPEC-007/008 cost metrics
  SPEC-009 (compliance)   ── builds on lib/compliance (exists)   ; strengthens go-live gate

Phase 3 (AI features, gated):
  SPEC-007 (AI reply) ── after SPEC-006 (usage/cost visibility) + AI seam
  SPEC-008 (AI lead qual) ── after SPEC-007 (shared AI seam) + TICKET009 (per-tenant attribution)

Phase 4 (future-proofing):
  SPEC-010 (RLS) ── after TICKET009 (reliable orgId in session) + pooling decision
  Major upgrades (next16 / prisma7 / zod4 / tailwind4) ── plan/BACKLOG.md, one per isolated branch

Phase 5 (AFK continuation queue — demo-safe, no secrets, verifiable; SPEC-001..010 all done):
  SPEC-011 (inbox lead score)        ── after SPEC-008 (done)
  SPEC-013 (state quiet hours)       ── after SPEC-009 (done); pure logic
  SPEC-014 (consent immutability)    ── after SPEC-009 (done)
  SPEC-015 (delivery metrics)        ── after SPEC-006 (done)
  SPEC-012 (AI seam: copy+summary)   ── after SPEC-007 (done); shares lib/ai/provider → serialize vs other AI edits

Phase 6 (infrastructure resilience & validation):
  SPEC-016 (bullmq hardening)        ── after SPEC-015 (done)
  SPEC-017 (lookup validation seam)  ── after SPEC-014 (done)

Phase 7 (distributed infrastructure & production enablement):
  SPEC-018 (Redis rate limiter)      ── after SPEC-016 (done)
  SPEC-019 (OTel exporter)           ── after SPEC-006 (done)
  SPEC-020 (RLS prod enablement)     ── after SPEC-010 (done) & TICKET009

Phase 8 (compliance depth & scraping diagnostics):
  SPEC-021 (Double opt-in workflow)  ── after SPEC-009 (done)
  SPEC-022 (Prometheus metrics API)  ── after SPEC-015 (done)
  SPEC-023 (TCPA keyword auto-reply) ── after Twilio webhook ingestion

Phase 9 (Perpetual improvement Wave 9; Todo):
  SPEC-024 (Segment query builder)   ── after SPEC-017 (done)
  SPEC-025 (Template preview engine) ── after SPEC-012 (done)
  SPEC-026 (Sentiment analysis seam) ── after SPEC-008 (done)
```


## Phases (sequenced)
- **Phase 0 — Stabilize & harden (now):** SPEC-001, SPEC-004, SPEC-002, SPEC-005, SPEC-003. All
  DAG-independent → ideal for parallel subagents in separate worktrees. Exit: all green, no regressions.
- **Phase 1 — Product backbone:** TICKET003 then TICKET009 (slice). Exit: seeded user works
  inbox reply; auth seam in place with demo fallback, gate green.
- **Phase 2 — Quality + compliance:** SPEC-006, SPEC-009. Exit: OTel + PII-safe logging behind flags;
  quiet-hours + consent-evidence as executable checks feeding the live-message hard gate.
- **Phase 3 — AI value (gated):** SPEC-007, SPEC-008. Exit: real AI behind explicit cost/data gates with
  review-before-send; fake provider stays default.
- **Phase 4 — Future-proofing:** SPEC-010 (RLS), then staged major upgrades from BACKLOG.
- **Phase 5 — AFK continuation queue (done):** SPEC-011, SPEC-012, SPEC-013, SPEC-014, SPEC-015.
- **Phase 6 — Infrastructure resilience & input validation (done):** SPEC-016 (done), SPEC-017 (done).
- **Phase 7 — Distributed infrastructure & production enablement (done):** SPEC-018 (done), SPEC-019 (done), SPEC-020 (done).
- **Phase 8 — Compliance depth & scraping diagnostics (done):** SPEC-021 (done), SPEC-022 (done), SPEC-023 (done).
- **Phase 9 — Segment sync, template validation, and sentiment analysis:** SPEC-024 (Todo), SPEC-025 (Todo), SPEC-026 (Todo).


## Risks / blockers
See `plan/RISK_REGISTER.md`. Top: CI can't verify e2e until SPEC-002; real AI/Clerk/Stripe enablement is
human-gated (secrets, cost); major upgrades are breaking and must stay isolated. Honesty rule: a check is
"passed" only if it ran and passed; e2e absent Postgres is "not run."

## Maintenance loop
Per `plan/AGENTS.md` (which points to `/AGENTS.md`): status → pick one unblocked spec/ticket → isolate →
implement minimally → targeted then broad checks → self-review → update PROGRESS + docs → file follow-ups.
