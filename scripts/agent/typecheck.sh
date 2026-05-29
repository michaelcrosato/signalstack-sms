#!/usr/bin/env bash
# TypeScript type check (tsc --noEmit).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
run_script typecheck
