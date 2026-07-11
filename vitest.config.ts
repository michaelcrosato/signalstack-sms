import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Integration suites share one real database. Serialize files when they are enabled so global
    // invariants such as first-owner bootstrap cannot race an unrelated fixture in another worker.
    fileParallelism: process.env.RUN_DB_TESTS !== "true"
  }
});
