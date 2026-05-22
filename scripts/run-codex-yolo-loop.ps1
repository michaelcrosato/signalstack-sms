param(
  [string]$Repo = "",
  [int]$FuseMinutes = 0,
  [int]$GateRetryDelaySeconds = 15,
  [switch]$FullYolo,
  [switch]$DryRun,
  [switch]$DryIteration,
  [string]$Model = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = if ([string]::IsNullOrWhiteSpace($Repo)) {
  Resolve-Path (Join-Path $PSScriptRoot "..")
} else {
  Resolve-Path $Repo
}
Set-Location $repoRoot

$fuseMinutes = if ($FuseMinutes -gt 0) {
  $FuseMinutes
} elseif ($env:CODEX_YOLO_FUSE_MINUTES) {
  [int]$env:CODEX_YOLO_FUSE_MINUTES
} else {
  0
}
$startedAt = Get-Date
$deadline = if ($fuseMinutes -gt 0) {
  $startedAt.AddMinutes($fuseMinutes)
} else {
  $null
}

Write-Host "SignalStack Codex yolo loop"
if ($null -eq $deadline) {
  Write-Host "Fuse minutes: none"
} else {
  Write-Host "Fuse minutes: $fuseMinutes"
}
Write-Host "Codex command: codex exec"
Write-Host "Operating prompt: docs/AXIOMS.md + docs/AGENT-LOOP.md"
Write-Host "Unattended runs must keep production credentials and destructive live-world actions out of scope."

function Test-FuseExpired {
  $null -ne $deadline -and (Get-Date) -ge $deadline
}

function Wait-BeforeNextIteration {
  Start-Sleep -Seconds $GateRetryDelaySeconds
}

while ($true) {
  if (Test-FuseExpired) {
    Write-Error "Cost/time fuse reached after $fuseMinutes minutes. Human restart required."
    exit 1
  }

  & (Join-Path $PSScriptRoot "assert-gate-integrity.ps1")
  $integrityExitCode = if ($?) { 0 } else { 1 }
  if ($integrityExitCode -ne 0) {
    Write-Warning "Gate integrity check exited $integrityExitCode. Waiting before the next loop attempt."
    Wait-BeforeNextIteration
    continue
  }

  $prompt = @"
Read docs/AXIOMS.md and docs/AGENT-LOOP.md before acting.
Execute one autonomous loop iteration in this repository.
Use the protected local gate before treating work as green.
Do not edit docs/AXIOMS.md or scripts/*gate*.ps1 or scripts/run-codex-yolo-loop.ps1.
Do not use production credentials or destructive live-world actions.
"@

  if ($DryRun -or $DryIteration) {
    Write-Host "Dry run: would invoke Codex for one loop iteration with the operating prompt."
    Write-Host $prompt
    & (Join-Path $PSScriptRoot "local-gate.ps1")
    $dryGateExitCode = if ($?) { 0 } else { 1 }
    if ($dryGateExitCode -ne 0) {
      Write-Warning "Dry iteration local gate exited $dryGateExitCode."
    }
    exit $dryGateExitCode
  }

  $codexArgs = @("exec", "-C", $repoRoot)
  if ($FullYolo) {
    $codexArgs += "--dangerously-bypass-approvals-and-sandbox"
  }
  if (-not [string]::IsNullOrWhiteSpace($Model)) {
    $codexArgs += @("-m", $Model)
  }

  & codex @codexArgs $prompt
  $codexExitCode = $LASTEXITCODE
  if ($codexExitCode -ne 0) {
    if (Test-FuseExpired) {
      Write-Error "Codex exited $codexExitCode at the fuse deadline. Human restart required."
      exit $codexExitCode
    }

    Write-Warning "Codex exited $codexExitCode. Starting a fresh loop iteration; repository truth and the protected gate still govern commits."
    Wait-BeforeNextIteration
    continue
  }

  & (Join-Path $PSScriptRoot "local-gate.ps1")
  $gateExitCode = if ($?) { 0 } else { 1 }
  if ($gateExitCode -ne 0) {
    if (Test-FuseExpired) {
      Write-Error "Protected local gate exited $gateExitCode at the fuse deadline. Human restart required."
      exit $gateExitCode
    }

    Write-Warning "Protected local gate exited $gateExitCode. Starting a fresh loop iteration; failed gates are not treated as green."
    Wait-BeforeNextIteration
    continue
  }
}
