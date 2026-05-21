#Requires -Version 5.1
<#
codex-skynet-max.ps1

SignalStack SMS launcher for the canonical autonomous-loop system.

This script does NOT replace the repo-native loop.
It supervises the protected repo loop created by:

- docs/AXIOMS.md
- docs/AGENT-LOOP.md
- docs/LOOP_LOG.md
- scripts/assert-gate-integrity.ps1
- scripts/local-gate.ps1
- scripts/run-codex-yolo-loop.ps1

It intentionally avoids adding doctrine, retry counters, multi-agent machinery,
or alternate validation rules.

Run:
  .\codex-skynet-max.ps1 -FullYolo -KeepAwake -FuseMinutes 840

Optional one-shot preflight:
  .\codex-skynet-max.ps1 -PreflightOnly
#>

[CmdletBinding()]
param(
  [string]$Repo = "C:\dev\signalstack-sms",

  # Cost/time fuse. This is the unattended backstop for "Never Stop Looping."
  # 840 minutes = 14 hours.
  [int]$FuseMinutes = 840,

  [switch]$FullYolo,
  [switch]$KeepAwake,
  [switch]$PreflightOnly,
  [switch]$DryIteration,
  [string]$Model = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Required command not found on PATH: $Name"
  }

  return $cmd.Source
}

function Invoke-RepoScript {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$Arguments = @()
  )

  if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
    throw "Required script missing: $ScriptPath"
  }

  Write-Host ""
  Write-Host "Running: $ScriptPath $($Arguments -join ' ')"
  Write-Host "----------------------------------------"

  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments
  $exit = $LASTEXITCODE

  Write-Host "----------------------------------------"
  Write-Host "Exit code: $exit"

  if ($exit -ne 0) {
    throw "Script failed: $ScriptPath"
  }
}

function Assert-RequiredPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Required path missing: $Path"
  }
}

$repoRoot = (Resolve-Path $Repo).Path
Set-Location $repoRoot

Require-Command "git" | Out-Null
Require-Command "npm" | Out-Null
if (-not $PreflightOnly) {
  Require-Command "codex" | Out-Null
}

Write-Host "========================================"
Write-Host "SignalStack SMS canonical loop launcher"
Write-Host "Repo: $repoRoot"
Write-Host "FuseMinutes: $FuseMinutes"
Write-Host "FullYolo: $FullYolo"
Write-Host "PreflightOnly: $PreflightOnly"
Write-Host "DryIteration: $DryIteration"
Write-Host "Started: $(Get-Date)"
Write-Host "========================================"

if ($KeepAwake) {
  Write-Host "Applying AC power settings to prevent sleep/hibernate."
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  powercfg /change monitor-timeout-ac 30 | Out-Null
}

$requiredPaths = @(
  "docs\AXIOMS.md",
  "docs\AGENT-LOOP.md",
  "docs\LOOP_LOG.md",
  "docs\loop-artifacts\.gitkeep",
  "scripts\assert-gate-integrity.ps1",
  "scripts\local-gate.ps1",
  "scripts\run-codex-yolo-loop.ps1"
)

foreach ($path in $requiredPaths) {
  Assert-RequiredPath $path
}

Write-Host ""
Write-Host "Required canonical loop files exist."

# First trust boundary: protected files must match the pinned manifest.
Invoke-RepoScript -ScriptPath "scripts\assert-gate-integrity.ps1"

# Second trust boundary: current repo must be green before unattended looping.
Invoke-RepoScript -ScriptPath "scripts\local-gate.ps1"

if ($PreflightOnly) {
  Write-Host "Preflight passed. Exiting because -PreflightOnly was supplied."
  exit 0
}

$loopArgs = @(
  "-Repo", $repoRoot,
  "-FuseMinutes", "$FuseMinutes"
)

if ($FullYolo) {
  $loopArgs += "-FullYolo"
}

if ($DryIteration) {
  $loopArgs += "-DryIteration"
}

if (-not [string]::IsNullOrWhiteSpace($Model)) {
  $loopArgs += @("-Model", $Model)
}

Write-Host ""
Write-Host "Launching repo-native canonical loop."
Write-Host "Loop script: scripts\run-codex-yolo-loop.ps1"
Write-Host "Arguments: $($loopArgs -join ' ')"
Write-Host ""

& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "scripts\run-codex-yolo-loop.ps1" @loopArgs
$loopExit = $LASTEXITCODE

Write-Host ""
Write-Host "========================================"
Write-Host "Canonical loop ended"
Write-Host "Exit code: $loopExit"
Write-Host "Finished: $(Get-Date)"
Write-Host "Latest commits:"
git log --oneline -10
Write-Host "Current status:"
git status --short
Write-Host "========================================"

exit $loopExit
