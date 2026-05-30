# PowerShell variant of test.sh for Windows-native execution
# Unit tests (vitest). Forwards args.

if ($args.Count -gt 0) {
    npm run test -- $args
} else {
    npm run test
}
exit $LASTEXITCODE
