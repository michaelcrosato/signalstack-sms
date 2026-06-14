import { readFileSync } from "node:fs";

const platformNotes = readFileSync("docs/DEPLOYMENT_PLATFORM_NOTES.md", "utf8");
const deploymentRunbook = readFileSync("docs/PRODUCTION_DEPLOYMENT.md", "utf8");
const localGate = readFileSync("docs/LOCAL_GATE.md", "utf8");

const requiredPlatformText = [
  "demo-safe production-like hosting only",
  "DEMO_MODE=true",
  "LIVE_MESSAGING_ENABLED=false",
  "LIVE_BILLING_ENABLED=false",
  "MESSAGING_PROVIDER=dummy",
  "AI_PROVIDER=fake",
  "npm run production:gate",
  "Do not run `npm run db:reset`, destructive SQL",
  "/settings/system",
  "must not bypass the centralized messaging hard gate",
  "live messaging, live billing, live AI, provider calls, notifications, and external telemetry remain blocked"
];

const missingPlatformText = requiredPlatformText.filter((text) => !platformNotes.includes(text));

if (missingPlatformText.length > 0) {
  console.error(`Deployment platform notes are missing required safety text: ${missingPlatformText.join("; ")}`);
  process.exit(1);
}

if (!deploymentRunbook.includes("docs/DEPLOYMENT_PLATFORM_NOTES.md")) {
  console.error("Production deployment runbook must link to docs/DEPLOYMENT_PLATFORM_NOTES.md.");
  process.exit(1);
}

if (!localGate.includes("npm run platform:check")) {
  console.error("Local gate must document npm run platform:check.");
  process.exit(1);
}

console.log("Deployment platform notes verified.");
