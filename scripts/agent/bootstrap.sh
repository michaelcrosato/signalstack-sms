#!/usr/bin/env bash
# One-time setup: env file, dependencies, Prisma client. Safe to re-run.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "+ created .env from .env.example (demo-safe defaults; gitignored)"
else
  echo "- .env already present or no .env.example; leaving as-is"
fi

echo "-> installing dependencies"
run_install

run_script db:generate

echo "+ bootstrap complete. Next: scripts/agent/doctor.sh then scripts/agent/check.sh"
