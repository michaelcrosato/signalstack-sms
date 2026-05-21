param(
  [string]$Repo = "",
  [int]$FuseMinutes = 0,
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
  720
}
$startedAt = Get-Date
$deadline = $startedAt.AddMinutes($fuseMinutes)

Write-Host "SignalStack Codex yolo loop"
Write-Host "Fuse minutes: $fuseMinutes"
Write-Host "Codex command: codex exec"
Write-Host "Operating prompt: docs/AXIOMS.md + docs/AGENT-LOOP.md"
Write-Host "Unattended runs must keep production credentials and destructive live-world actions out of scope."

while ($true) {
  if ((Get-Date) -ge $deadline) {
    Write-Error "Cost/time fuse reached after $fuseMinutes minutes. Human restart required."
    exit 1
  }

  & (Join-Path $PSScriptRoot "assert-gate-integrity.ps1")
  if (-not $?) {
    exit 1
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
    exit $LASTEXITCODE
  }

  $codexArgs = @("exec", "-C", $repoRoot)
  if ($FullYolo) {
    $codexArgs += "--dangerously-bypass-approvals-and-sandbox"
  }
  if (-not [string]::IsNullOrWhiteSpace($Model)) {
    $codexArgs += @("-m", $Model)
  }

  & codex @codexArgs $prompt
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  & (Join-Path $PSScriptRoot "local-gate.ps1")
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
