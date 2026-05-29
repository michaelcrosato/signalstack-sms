#!/usr/bin/env bash
# Read-only environment diagnostics. Makes no changes.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo "node: $(node -v 2>/dev/null || echo MISSING)"
echo "npm:  $(npm -v 2>/dev/null || echo MISSING)"
[ -d node_modules ] && echo "ok  node_modules present" || echo "!!  node_modules missing -> scripts/agent/bootstrap.sh"
[ -f .env ] && echo "ok  .env present" || echo "!!  .env missing -> scripts/agent/bootstrap.sh"
[ -d node_modules/.prisma/client ] && echo "ok  prisma client generated" || echo "!!  prisma client missing -> npm run db:generate"
echo "DATABASE_URL: ${DATABASE_URL:-(unset; .env or scripts/validate.ts supplies a demo default)}"
echo "--- git ---"
git status --short --branch 2>/dev/null | head -20 || true
echo "doctor: advisory only; no changes made."
