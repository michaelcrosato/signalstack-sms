# PowerShell variant of doctor.sh for Windows-native execution
# Read-only environment diagnostics. Makes no changes.

$ErrorActionPreference = "Stop"

Write-Host "node: $(node -v 2>$null)"
Write-Host "npm:  $(npm -v 2>$null)"

if (Test-Path node_modules) {
    Write-Host "ok  node_modules present"
} else {
    Write-Host "!!  node_modules missing -> pwsh scripts/agent/bootstrap.ps1"
}

if (Test-Path .env) {
    Write-Host "ok  .env present"
} else {
    Write-Host "!!  .env missing -> pwsh scripts/agent/bootstrap.ps1"
}

if (Test-Path node_modules/.prisma/client) {
    Write-Host "ok  prisma client generated"
} else {
    Write-Host "!!  prisma client missing -> npm run db:generate"
}

$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    $dbUrl = "(unset; .env or scripts/validate.ts supplies a demo default)"
}
Write-Host "DATABASE_URL: $dbUrl"

Write-Host "--- git ---"
git status --short --branch 2>$null | Select-Object -First 20

Write-Host "doctor: advisory only; no changes made."
