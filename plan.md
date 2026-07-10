1. Use `run_in_bash_session` to create the test file `tests/unit/lib/db/prisma.test.ts` with test cases covering the `prisma` client initialization, `globalThis` assignment in different environments, and the invocation of `applyDemoSafeRuntimeDefaults`.
2. Use `run_in_bash_session` to run `npx vitest run tests/unit/lib/db/prisma.test.ts` to ensure the new tests pass and catch potential bugs.
3. Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
4. Use `submit` to create a PR with the title "🧪 [Testing] Add tests for prisma.ts" and a description highlighting the added coverage.
