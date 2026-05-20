Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

& (Join-Path $PSScriptRoot "assert-gate-integrity.ps1")
if (-not $?) {
  exit 1
}

$env:DEMO_MODE = if ($env:DEMO_MODE) { $env:DEMO_MODE } else { "true" }
$env:LIVE_MESSAGING_ENABLED = if ($env:LIVE_MESSAGING_ENABLED) { $env:LIVE_MESSAGING_ENABLED } else { "false" }
$env:LIVE_BILLING_ENABLED = if ($env:LIVE_BILLING_ENABLED) { $env:LIVE_BILLING_ENABLED } else { "false" }
$env:MESSAGING_PROVIDER = if ($env:MESSAGING_PROVIDER) { $env:MESSAGING_PROVIDER } else { "dummy" }
$env:AI_PROVIDER = if ($env:AI_PROVIDER) { $env:AI_PROVIDER } else { "fake" }

Write-Host "Running SignalStack local gate: npm run validate"
& npm run validate
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
