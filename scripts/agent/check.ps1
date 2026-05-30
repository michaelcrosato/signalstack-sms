# PowerShell variant of check.sh for Windows-native execution
# Full local gate: the canonical aggregator (contracts, secrets, compliance,
# production gates, lint, typecheck, db, vitest, e2e smoke, build).

npm run validate
exit $LASTEXITCODE
