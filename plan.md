1. **Understand**: The goal is to add tests for the `getLocalDeliveryReviewStatus` function located in `lib/messaging/delivery-review.ts`. This function takes an object with numbers (`outboundMessages`, `delivered`, `pending`, `failed`) and returns a string describing the delivery status based on those counts. It's a pure function and should be very easy to unit test.

2. **Test framework**: The project is using Vitest (`import { describe, expect, it } from "vitest";` seen in other test files).

3. **Test scenarios**:
   - `outboundMessages === 0`: Should return "No outbound evidence"
   - `failed > 0`: Should return "${failed} failed; review evidence"
   - `pending > 0` (and `failed === 0`): Should return "${pending} pending; awaiting provider status"
   - `delivered === outboundMessages` (and `failed === 0` and `pending === 0` and `outboundMessages > 0`): Should return "All delivered"
   - Fallback (e.g. `delivered < outboundMessages` but no failures or pending? Wait, the math doesn't check if `delivered + pending + failed === outboundMessages`. If none of the specific conditions match, it returns "Review delivery evidence". Example: `outboundMessages=10`, `delivered=5`, `pending=0`, `failed=0` -> Returns "Review delivery evidence").

4. **Implementation details**: Create a new test file `tests/unit/messaging/delivery-review.test.ts` (matching the pattern in `tests/unit/messaging/`). Write describe/it blocks covering all branching paths.

5. **Plan**:
   - 1. Create `tests/unit/messaging/delivery-review.test.ts`.
   - 2. Import `getLocalDeliveryReviewStatus` from `@/lib/messaging/delivery-review`.
   - 3. Write unit tests to cover all conditions in `getLocalDeliveryReviewStatus`.
   - 4. Run `npm run test:unit` (or similar) to ensure the test passes.
   - 5. Run pre-commit instructions.
   - 6. Submit the PR.
