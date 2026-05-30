#!/usr/bin/env bash
# Shared helpers for scripts/agent/*. Source this; do not run directly.
# Reuses the canonical npm scripts so there is one source of truth for gates.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# detect package manager: explicit override first, then lockfile preference
detect_package_manager() {
  if [ -n "${PACKAGE_MANAGER:-}" ]; then
    echo "$PACKAGE_MANAGER"
    return
  fi

  if [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then
    echo "npm"
    return
  fi

  if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
    return
  fi

  if [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
    echo "yarn"
    return
  fi

  # Keep existing behaviour even if lockfile detection fails.
  echo "npm"
}

run_pm() {
  local pm="$1"
  shift
  case "$pm" in
    npm)
      command npm "$@"
      ;;
    pnpm)
      command pnpm "$@"
      ;;
    yarn)
      command yarn "$@"
      ;;
    *)
      command npm "$@"
      ;;
  esac
}

# run_install [args...] -> pm install with args
run_install() {
  local pm
  pm="$(detect_package_manager)"
  echo "-> $pm install $*"
  run_pm "$pm" install "$@"
}

# have_script <name> -> 0 if package.json defines that npm script
have_script() {
  node -e "process.exit((require('./package.json').scripts||{})['$1']?0:1)" 2>/dev/null
}

# run_script <npm-script> [args...] -> runs it, or prints a skip note if absent
run_script() {
  local name="$1"; shift || true
  if have_script "$name"; then
    local pm
    pm="$(detect_package_manager)"
    echo "-> $pm run $name $*"
    run_pm "$pm" run "$name" -- "$@"
  else
    echo "- skipped: no \"$name\" script in package.json"
  fi
}
