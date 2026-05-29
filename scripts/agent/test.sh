#!/usr/bin/env bash
# Unit tests (vitest). Forwards args, e.g. scripts/agent/test.sh tests/unit/product/contacts.test.ts
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
run_script test "$@"
