#!/usr/bin/env bash
# ESLint over the repo.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
run_script lint
