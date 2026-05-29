#!/usr/bin/env bash
# Full local gate: the canonical aggregator (contracts, secrets, compliance,
# production gates, lint, typecheck, db, vitest, e2e smoke, build).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
run_script validate
