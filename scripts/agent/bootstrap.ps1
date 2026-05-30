# PowerShell variant of bootstrap.sh for Windows-native execution
# One-time setup: env file, dependencies, Prisma client. Safe to re-run.

if (-not (Test-Path .env) -and (Test-Path .env.example)) {
    Copy-Item .env.example .env
    Write-Host "+ created .env from .env.example (demo-safe defaults; gitignored)"
} else {
    Write-Host "- .env already present or no .env.example; leaving as-is"
}

Write-Host "-> installing dependencies"
npm install

Write-Host "-> generating prisma client"
npm run db:generate

Write-Host "+ bootstrap complete. Next: pwsh scripts/agent/doctor.ps1 then pwsh scripts/agent/check.ps1"
