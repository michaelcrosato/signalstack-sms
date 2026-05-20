param(
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$fuseMinutes = if ($env:CODEX_YOLO_FUSE_MINUTES) { [int]$env:CODEX_YOLO_FUSE_MINUTES } else { 720 }
$codexCommand = if ($env:CODEX_LOOP_COMMAND) { $env:CODEX_LOOP_COMMAND } else { "codex" }
$codexArgs = if ($env:CODEX_LOOP_ARGS) { $env:CODEX_LOOP_ARGS } else { "" }
$startedAt = Get-Date
$deadline = $startedAt.AddMinutes($fuseMinutes)

Write-Host "SignalStack Codex yolo loop"
Write-Host "Fuse minutes: $fuseMinutes"
Write-Host "Codex command: $codexCommand $codexArgs"
Write-Host "Operating prompt: docs/AXIOMS.md + docs/AGENT-LOOP.md"
Write-Host "Set CODEX_LOOP_COMMAND and CODEX_LOOP_ARGS if your Codex CLI invocation differs."
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

  if ($DryRun) {
    Write-Host "Dry run: would invoke Codex for one loop iteration with the operating prompt."
    Write-Host $prompt
    & (Join-Path $PSScriptRoot "local-gate.ps1")
    exit $LASTEXITCODE
  }

  $tmpPrompt = New-TemporaryFile
  try {
    Set-Content -LiteralPath $tmpPrompt -Value $prompt -Encoding utf8
    if ($codexArgs.Trim().Length -gt 0) {
      & $codexCommand $codexArgs $tmpPrompt
    } else {
      & $codexCommand $tmpPrompt
    }
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Remove-Item -LiteralPath $tmpPrompt -Force -ErrorAction SilentlyContinue
  }

  & (Join-Path $PSScriptRoot "local-gate.ps1")
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
