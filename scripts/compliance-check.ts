import { readFileSync } from "node:fs";
import { envDefaults } from "../lib/env/defaults";

const example = readFileSync(".env.example", "utf8");
for (const [key, expected] of Object.entries(envDefaults)) {
  if (!example.includes(`${key}=${expected}`)) {
    console.error(`.env.example must contain ${key}=${expected}`);
    process.exit(1);
  }
}

if (process.env.CI === "true") {
  if (process.env.LIVE_MESSAGING_ENABLED === "true" || process.env.LIVE_BILLING_ENABLED === "true") {
    console.error("CI cannot run with live messaging or billing enabled.");
    process.exit(1);
  }
}

console.log("Compliance safety defaults verified.");
