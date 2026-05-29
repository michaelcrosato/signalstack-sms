import { readFileSync } from "node:fs";

// Executable gate for SPEC-003: the security-header baseline must stay configured in next.config.mjs.
// Static text assertion (mirrors context-budget-check.ts) — no import of the Next config at runtime.
const config = readFileSync("next.config.mjs", "utf8");

const required = [
  "poweredByHeader: false",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Strict-Transport-Security",
  "Permissions-Policy",
  "Content-Security-Policy",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "/:path*"
];

const failures = required.filter((needle) => !config.includes(needle));

if (failures.length > 0) {
  console.error("Security headers check failed — next.config.mjs is missing:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Security headers check passed.");
