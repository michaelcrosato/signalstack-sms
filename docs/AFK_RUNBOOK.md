# AFK Runbook — unattended 12-hour loop

How to run SignalStack SMS autonomously and safely for ~12 hours.

## TL;DR

```powershell
# from repo root (Windows / pwsh)
pwsh scripts/agent/afk-12h.ps1 -FullYolo
```

Or step by step:

```bash
npm run afk:preflight        # services + migrate + seed + Chromium + green gate
```
```powershell
pwsh scripts/run-codex-yolo-loop.ps1 -FuseMinutes 720 -FullYolo
```

## What preflight does (`scripts/agent/afk-preflight.sh`)

- `docker compose up -d` — postgres + redis, pinned `restart: unless-stopped` so they survive the run.
- waits for Postgres, then `db:deploy` (migrations) and `demo:seed`.
- `npx playwright install chromium` (e2e:smoke self-starts the dev server on :3100).
- runs the protected gate `scripts/local-gate.ps1` (integrity check + `npm run validate`) — must be GREEN.

## What the loop does (`scripts/run-codex-yolo-loop.ps1`, integrity-pinned)

Endless explore → plan → work → validate → commit loop per `docs/AGENT-LOOP.md`. It integrity-checks the gate
before each iteration and commits only when the protected gate passes. `-FuseMinutes 720` caps it at 12h;
`-FullYolo` passes codex `--dangerously-bypass-approvals-and-sandbox` for true unattended operation.

## What it will work on

The demo-safe queue `plan/specs/SPEC-011..015` (see `docs/NEXT_PROMPTS.md` / `plan/EXECUTION_PROMPT.md`):
inbox lead-score surfacing, per-US-state quiet hours, consent-evidence immutability, delivery metrics
counters, and the AI seam for campaign-copy + conversation-summary. When the queue is exhausted the loop
parks (the EXHAUSTION rule) — everything beyond it is human-gated.

## Guardrails (doctrine + gates)

- No secrets, no live SMS/billing/AI, no destructive/prod DB ops, no pushes — all behind hard gates.
- Gate scripts + `docs/AXIOMS.md` are integrity-pinned; the agent may propose but never edits them.
- Commits land only after the protected gate is green; a failed gate is never treated as green.

## Monitor / stop

- Progress: `git log --oneline`, `plan/PROGRESS.md`, `docs/loop-artifacts/`, `SUMMARY.codex.md`.
- Stop: interrupt the loop window (it runs until the fuse or a hard interruption).

## Known / notes

- `db:generate` retries the transient Windows EPERM (`scripts/db-generate.ts`) so the gate stays green AFK.
- Nothing is pushed to any remote; review + push is a human step after the run.
