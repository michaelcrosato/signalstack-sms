#!/usr/bin/env bash
# Shared helpers for scripts/agent/*. Source this; do not run directly.
# Reuses the canonical npm scripts so there is one source of truth for gates.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# have_script <name> -> 0 if package.json defines that npm script
have_script() {
  node -e "process.exit((require('./package.json').scripts||{})['$1']?0:1)" 2>/dev/null
}

# run_script <npm-script> [args...] -> runs it, or prints a skip note if absent
run_script() {
  local name="$1"; shift || true
  if have_script "$name"; then
    echo "-> npm run $name $*"
    npm run "$name" -- "$@"
  else
    echo "- skipped: no \"$name\" script in package.json"
  fi
}
