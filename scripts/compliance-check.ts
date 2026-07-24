import { readFileSync } from "node:fs";
import { envDefaults } from "../lib/env/defaults";

const example = readFileSync(".env.example", "utf8");
for (const [key, expected] of Object.entries(envDefaults)) {
  if (!example.includes(`${key}=${expected}`)) {
    console.error(`.env.example must contain ${key}=${expected}`);
    process.exit(1);
  }
}

// SPEC-009 & M8 compliance assertions:
const gatesSource = readFileSync("lib/compliance/gates.ts", "utf8");
if (!gatesSource.includes("CONSENT_EVIDENCE_MISSING")) {
  console.error("lib/compliance/gates.ts must enforce CONSENT_EVIDENCE_MISSING (SPEC-009 consent evidence).");
  process.exit(1);
}

if (!gatesSource.includes("CONTACT_SUPPRESSED")) {
  console.error("lib/compliance/gates.ts must enforce CONTACT_SUPPRESSED (M8 suppression lists).");
  process.exit(1);
}

// Schema assertions for M8 compliance ledgers & 10DLC
const schemaSource = readFileSync("prisma/schema.prisma", "utf8");
const requiredModels = ["model ConsentEvent", "model AuditEvent", "model SuppressionEntry"];
for (const modelDef of requiredModels) {
  if (!schemaSource.includes(modelDef)) {
    console.error(`prisma/schema.prisma must define ${modelDef} for M8 compliance ledgers.`);
    process.exit(1);
  }
}

const required10DlcFields = ["brandRegistrationId", "campaignRegistrationId", "evidenceReference", "verificationStatus"];
for (const fieldName of required10DlcFields) {
  if (!schemaSource.includes(fieldName)) {
    console.error(`prisma/schema.prisma ComplianceProfile must include ${fieldName}.`);
    process.exit(1);
  }
}

// Tenant manifest assertions for append-only ledgers
const manifestSource = readFileSync("lib/db/tenant-manifest.ts", "utf8");
if (!manifestSource.includes('"ConsentEvent"') || !manifestSource.includes('"AuditEvent"')) {
  console.error("lib/db/tenant-manifest.ts must include ConsentEvent and AuditEvent in tenant manifest.");
  process.exit(1);
}

if (process.env.CI === "true") {
  if (process.env.LIVE_MESSAGING_ENABLED === "true" || process.env.LIVE_BILLING_ENABLED === "true") {
    console.error("CI cannot run with live messaging or billing enabled.");
    process.exit(1);
  }
}

console.log("Compliance safety defaults verified.");
