🧪 Add unit tests for aiDraftDailyCap and aiDraftCapExceeded

🎯 **What:** The testing gap addressed
This PR addresses missing unit tests for `aiDraftDailyCap` and `aiDraftCapExceeded` functions in `lib/ai/usage.ts`. These functions are critical for enforcing per-tenant daily caps on live AI drafts (cost guards).

📊 **Coverage:** What scenarios are now tested
- `aiDraftDailyCap`:
  - Returns default cap (100) when `AI_DRAFT_DAILY_CAP` is absent.
  - Returns default cap when `AI_DRAFT_DAILY_CAP` is an invalid string.
  - Returns default cap when `AI_DRAFT_DAILY_CAP` is 0 or negative.
  - Returns the parsed number when `AI_DRAFT_DAILY_CAP` is a valid positive integer.
  - Returns the floored number when `AI_DRAFT_DAILY_CAP` is a valid positive decimal.
- `aiDraftCapExceeded`:
  - Returns `true` when `usedInWindow` equals the daily cap.
  - Returns `true` when `usedInWindow` is strictly greater than the daily cap.
  - Returns `false` when `usedInWindow` is less than the daily cap.

✨ **Result:** The improvement in test coverage
We now have 100% test coverage for the synchronous AI usage cap utility functions, preventing regressions that could accidentally leak AI usage beyond the configured caps.
