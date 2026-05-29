#!/usr/bin/env bash
# Format code if a formatter is configured. No formatter is currently set up,
# so this skips cleanly rather than mutating files unexpectedly.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

if have_script format; then
  run_script format
elif npx --no-install prettier -v >/dev/null 2>&1; then
  echo "-> npx prettier --write ."
  npx --no-install prettier --write .
else
  echo "- no formatter configured (no \"format\" npm script or prettier). Skipping."
  echo "  Lint is the active style gate: scripts/agent/lint.sh"
fi
