# AFK 12-hour unattended launcher.
# Runs the preflight (services + migrate + seed + Chromium + green gate), then the protected codex yolo loop
# with a 12-hour fuse. Demo-safe: no secrets, no live calls, no push. The loop commits only when the
# integrity-pinned gate is green (docs/AGENT-LOOP.md governs behavior). See docs/AFK_RUNBOOK.md.
param(
  [int]$FuseMinutes = 720,
  [switch]$SkipPreflight,
  [switch]$FullYolo,
  [string]$Model = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

if (-not $SkipPreflight) {
  Write-Host "== AFK launcher: preflight (services + migrate + seed + Chromium + gate) =="
  & bash scripts/agent/afk-preflight.sh
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Preflight failed (exit $LASTEXITCODE). Fix the gate before starting the unattended loop."
    exit $LASTEXITCODE
  }
}

Write-Host "== AFK launcher: starting codex yolo loop for $FuseMinutes minutes =="
if (-not $FullYolo) {
  Write-Warning "Running without -FullYolo: codex may prompt for approvals and not run unattended. Add -FullYolo for a true AFK run."
}

$loopArgs = @("-FuseMinutes", $FuseMinutes)
if ($FullYolo) { $loopArgs += "-FullYolo" }
if (-not [string]::IsNullOrWhiteSpace($Model)) { $loopArgs += @("-Model", $Model) }

& (Join-Path $PSScriptRoot "..\run-codex-yolo-loop.ps1") @loopArgs
exit $LASTEXITCODE
