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
  .\codex-skynet-max.ps1 -FullYolo -KeepAwake

Optional capped run:
  .\codex-skynet-max.ps1 -FullYolo -KeepAwake -FuseMinutes 4320

Optional one-shot preflight:
  .\codex-skynet-max.ps1 -PreflightOnly
#>

[CmdletBinding()]
param(
  [string]$Repo = "C:\dev\signalstack-sms",

  # Optional cost/time fuse. The default is endless; use Ctrl+C or stop the process to end it.
  # 4320 minutes = 72 hours for a capped unattended weekend run.
  [int]$FuseMinutes = 0,
  [int]$GateRetryDelaySeconds = 15,

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
$startedAt = Get-Date
$deadline = if ($FuseMinutes -gt 0) {
  $startedAt.AddMinutes($FuseMinutes)
} else {
  $null
}

function Test-FuseExpired {
  $null -ne $deadline -and (Get-Date) -ge $deadline
}

function Wait-BeforeRestart {
  Start-Sleep -Seconds $GateRetryDelaySeconds
}

Require-Command "git" | Out-Null
Require-Command "npm" | Out-Null
if (-not $PreflightOnly) {
  Require-Command "codex" | Out-Null
}

Write-Host "========================================"
Write-Host "SignalStack SMS canonical loop launcher"
Write-Host "Repo: $repoRoot"
if ($FuseMinutes -gt 0) {
  Write-Host "FuseMinutes: $FuseMinutes"
} else {
  Write-Host "FuseMinutes: none"
}
Write-Host "GateRetryDelaySeconds: $GateRetryDelaySeconds"
Write-Host "FullYolo: $FullYolo"
Write-Host "PreflightOnly: $PreflightOnly"
Write-Host "DryIteration: $DryIteration"
Write-Host "Started: $startedAt"
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

# Second trust boundary: preflight mode must be green. Normal loop mode can start from
# a red or transiently crashed local gate because the agent loop is responsible for repair.
if ($PreflightOnly) {
  Invoke-RepoScript -ScriptPath "scripts\local-gate.ps1"
} else {
  try {
    Invoke-RepoScript -ScriptPath "scripts\local-gate.ps1"
  } catch {
    Write-Warning "Initial local gate did not pass before loop launch: $($_.Exception.Message)"
    Write-Warning "Continuing into the repo-native loop; failed gates are not treated as green."
  }
}

if ($PreflightOnly) {
  Write-Host "Preflight passed. Exiting because -PreflightOnly was supplied."
  exit 0
}

$loopArgs = @("-Repo", $repoRoot, "-GateRetryDelaySeconds", "$GateRetryDelaySeconds")

if ($FuseMinutes -gt 0) {
  $loopArgs += @("-FuseMinutes", "$FuseMinutes")
}

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

while ($true) {
  if (Test-FuseExpired) {
    Write-Error "Outer launcher fuse reached after $FuseMinutes minutes. Human restart required."
    exit 1
  }

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

  if ($DryIteration) {
    exit $loopExit
  }

  if ($loopExit -eq 0) {
    if (Test-FuseExpired) {
      exit 0
    }

    Write-Warning "Repo-native loop exited cleanly before the launcher was stopped. Restarting it."
    Wait-BeforeRestart
    continue
  }

  if (Test-FuseExpired) {
    Write-Error "Repo-native loop exited $loopExit at the fuse deadline. Human restart required."
    exit $loopExit
  }

  Write-Warning "Repo-native loop exited $loopExit. Restarting it; failed gates are not treated as green."
  Wait-BeforeRestart
}
