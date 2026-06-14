import { readFileSync, existsSync } from "node:fs";
import { envDefaults } from "../src/lib/env/defaults";

const example = readFileSync(".env.example", "utf8");
for (const [key, expected] of Object.entries(envDefaults)) {
  if (!example.includes(`${key}=${expected}`)) {
    console.error(`.env.example must contain ${key}=${expected}`);
    process.exit(1);
  }
}

// SPEC-009: the messaging hard gate must enforce stored consent evidence before a live send.
const gatesPath = existsSync("lib/compliance/gates.ts") ? "lib/compliance/gates.ts" : "src/lib/compliance/gates.ts";
const gatesSource = readFileSync(gatesPath, "utf8");
if (!gatesSource.includes("CONSENT_EVIDENCE_MISSING")) {
  console.error("lib/compliance/gates.ts must enforce CONSENT_EVIDENCE_MISSING (SPEC-009 consent evidence).");
  process.exit(1);
}

if (process.env.CI === "true") {
  if (process.env.LIVE_MESSAGING_ENABLED === "true" || process.env.LIVE_BILLING_ENABLED === "true") {
    console.error("CI cannot run with live messaging or billing enabled.");
    process.exit(1);
  }
}

console.log("Compliance safety defaults verified.");
