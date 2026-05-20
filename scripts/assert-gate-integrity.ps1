Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $repoRoot "scripts/gate-integrity-manifest.json"

$protectedFiles = @(
  "docs/AXIOMS.md",
  "scripts/local-gate.ps1",
  "scripts/assert-gate-integrity.ps1",
  "scripts/run-codex-yolo-loop.ps1"
)

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $fullPath = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Protected file is missing: $RelativePath"
  }

  (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  $hashes = [ordered]@{}
  foreach ($file in $protectedFiles) {
    $hashes[$file] = Get-FileSha256 -RelativePath $file
  }

  $manifest = [ordered]@{
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    protectedFiles = $hashes
  }

  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Host "Created gate integrity manifest at scripts/gate-integrity-manifest.json"
  exit 0
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifestFiles = $manifest.protectedFiles

foreach ($file in $protectedFiles) {
  if (-not ($manifestFiles.PSObject.Properties.Name -contains $file)) {
    Write-Error "Gate integrity manifest is missing protected file: $file"
    exit 1
  }

  $expected = [string]$manifestFiles.$file
  $actual = Get-FileSha256 -RelativePath $file
  if ($actual -ne $expected.ToLowerInvariant()) {
    Write-Error "Gate integrity mismatch for $file. Expected $expected but found $actual. Only a human may change axioms or gate scripts."
    exit 1
  }
}

Write-Host "Gate integrity verified."
