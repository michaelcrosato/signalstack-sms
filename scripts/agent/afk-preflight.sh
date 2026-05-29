#!/usr/bin/env bash
# AFK preflight — make the repo ready for an unattended (12h) loop. Idempotent + demo-safe.
#   backing services (auto-restart) -> migrations -> demo seed -> e2e browser -> full protected gate.
# Run this once before launching scripts/agent/afk-12h.ps1 (or the codex yolo loop). It performs NO live
# calls and uses NO secrets; every external-impact action stays behind the repo's hard gates.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

export DATABASE_URL="${DATABASE_URL:-postgresql://signalstack:signalstack@localhost:5432/signalstack_sms?schema=public}"
export DEMO_MODE="${DEMO_MODE:-true}"
export LIVE_MESSAGING_ENABLED="${LIVE_MESSAGING_ENABLED:-false}"
export LIVE_BILLING_ENABLED="${LIVE_BILLING_ENABLED:-false}"
export MESSAGING_PROVIDER="${MESSAGING_PROVIDER:-dummy}"
export AI_PROVIDER="${AI_PROVIDER:-fake}"

echo "== AFK preflight =="

echo "-> backing services (postgres, redis; restart: unless-stopped)"
docker compose up -d

echo "-> waiting for Postgres to accept connections"
for _ in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U signalstack -d signalstack_sms >/dev/null 2>&1; then
    echo "   postgres ready"
    break
  fi
  sleep 1
done

run_script db:deploy
run_script demo:seed

echo "-> ensuring Playwright Chromium is installed (e2e:smoke self-starts the dev server)"
npx playwright install chromium

echo "-> full protected gate"
if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -File scripts/local-gate.ps1
else
  run_script validate
fi

echo "== AFK preflight complete: gate is green; repo is ready for the unattended loop. =="
