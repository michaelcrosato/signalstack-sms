🎯 **What:** Removed the unused export `assertDemoSafeDefaults` from `lib/env/defaults.ts`.
💡 **Why:** This is dead code that is not referenced anywhere else in the codebase. Removing it reduces clutter and improves maintainability.
✅ **Verification:** Ran `npm run lint` and `npm run validate` to ensure no functionality is broken. Also verified that there were no imports of this function using `grep`.
✨ **Result:** A cleaner codebase with less dead code.
