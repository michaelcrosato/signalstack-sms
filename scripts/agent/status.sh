#!/usr/bin/env bash
# Compact startup brief for autonomous loops: git state, recent commits,
# current handoff sections + sizes, large-file advisories.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
run_script agent:brief
