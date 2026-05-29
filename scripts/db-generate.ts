import { spawnSync } from "node:child_process";

// Resilient `prisma generate`. On Windows the query-engine DLL rename can transiently fail with EPERM when
// Defender/AV briefly holds the file, which otherwise makes `npm run validate` (and the AFK gate) flaky.
// This retries a few times with a short delay; it still exits non-zero if generation genuinely fails.
// Invoked as the `db:generate` npm script so both `validate` and manual calls get the retry.

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("npm_execpath is required to run prisma generate without shell execution.");
  process.exit(1);
}

function sleep(ms: number) {
  // Synchronous delay without extra deps.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const maxAttempts = 5;
const delayMs = 2000;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = spawnSync(process.execPath, [npmCli, "exec", "--", "prisma", "generate"], { stdio: "inherit" });
  if (result.status === 0) {
    process.exit(0);
  }
  if (attempt < maxAttempts) {
    console.warn(`prisma generate failed (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms (transient Windows EPERM is the usual cause)...`);
    sleep(delayMs);
  }
}

console.error(`prisma generate failed after ${maxAttempts} attempts.`);
process.exit(1);
