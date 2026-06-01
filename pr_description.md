🎯 **What:** The testing gap addressed
The `assertDemoSafeDefaults` function in `lib/env/defaults.ts` lacked test coverage. A new test suite was added to verify its expected behavior.

📊 **Coverage:** What scenarios are now tested
- Happy path: verifying that passing the exact `envDefaults` does not throw an error.
- Error condition: verifying that providing a mismatched value throws an error with the expected message.
- Error condition: verifying that missing a required default value throws an error.

✨ **Result:** The improvement in test coverage
The `assertDemoSafeDefaults` function is now fully covered with tests, ensuring regressions can be quickly caught when modifying default environment rules.
