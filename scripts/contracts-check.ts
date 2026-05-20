import { existsSync } from "node:fs";

const required = [
  "contracts/CONTRACT-DB.md",
  "contracts/CONTRACT-API.md",
  "contracts/CONTRACT-WEBHOOKS.md",
  "contracts/CONTRACT-PROVIDER-ADAPTER.md",
  "contracts/CONTRACT-AI.md",
  "contracts/CONTRACT-BILLING.md",
  "contracts/CONTRACT-TESTING.md",
  "contracts/CONTRACT-COMPLIANCE.md",
  "contracts/CONTRACT-QUEUE.md"
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length > 0) {
  console.error(`Missing contract files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Contract files present.");
