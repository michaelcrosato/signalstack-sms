import { readFileSync } from "node:fs";

// Executable gate for SPEC-007: the live-AI seam must stay gated, draft-only, PII-safe, and fake-by-default.
// Static text assertions (mirrors security-headers-check.ts) — no runtime import of app code.

type Rule = { file: string; mustInclude?: string[]; mustExclude?: string[] };

const rules: Rule[] = [
  // Hard gate requires all four conditions before live AI is allowed.
  { file: "lib/ai/ai-gate.ts", mustInclude: ['"live"', "LIVE_AI_ENABLED", "AI_API_KEY", "AI_COST_ACK"] },
  // Provider selects via the gate and redacts PII in prompts.
  { file: "lib/ai/provider.ts", mustInclude: ["evaluateAiHardGate", "resolveAiProvider", "redactValue"] },
  // Reply route goes through the seam, meters usage, and never calls a send/enqueue path.
  {
    file: "app/api/ai/reply-suggestion/route.ts",
    mustInclude: ["resolveAiProvider", "recordFakeAiUsage", "currentOrg.orgId"],
    mustExclude: ["createConversationOutboundReply", "sendSms", "deliverMessage", "enqueue"]
  },
  // Lead qualification goes through the same seam and is analysis-only (no send).
  {
    file: "app/api/ai/lead-qualification/route.ts",
    mustInclude: ["resolveAiProvider", "recordFakeAiUsage", "currentOrg.orgId"],
    mustExclude: ["createConversationOutboundReply", "sendSms", "deliverMessage", "enqueue"]
  },
  // Campaign copy route goes through the seam, meters usage, and has no send path.
  {
    file: "app/api/ai/campaign-copy/route.ts",
    mustInclude: ["resolveAiProvider", "recordFakeAiUsage", "currentOrg.orgId"],
    mustExclude: ["createConversationOutboundReply", "sendSms", "deliverMessage", "enqueue"]
  },
  // Conversation summary route goes through the seam, meters usage, and has no send path.
  {
    file: "app/api/ai/conversation-summary/route.ts",
    mustInclude: ["resolveAiProvider", "recordFakeAiUsage", "currentOrg.orgId"],
    mustExclude: ["createConversationOutboundReply", "sendSms", "deliverMessage", "enqueue"]
  },
  // Demo-safe defaults: live AI off, cost not acknowledged, provider fake.
  { file: ".env.example", mustInclude: ["AI_PROVIDER=fake", "LIVE_AI_ENABLED=false", "AI_COST_ACK=false"] },
  { file: "lib/env/defaults.ts", mustInclude: ['AI_PROVIDER: "fake"'] }
];

const failures: string[] = [];

for (const rule of rules) {
  let source = "";
  try {
    source = readFileSync(rule.file, "utf8");
  } catch {
    failures.push(`${rule.file} (missing)`);
    continue;
  }
  for (const needle of rule.mustInclude ?? []) {
    if (!source.includes(needle)) {
      failures.push(`${rule.file} must include: ${needle}`);
    }
  }
  for (const needle of rule.mustExclude ?? []) {
    if (source.includes(needle)) {
      failures.push(`${rule.file} must NOT include (live AI must stay draft-only): ${needle}`);
    }
  }
}

if (failures.length > 0) {
  console.error("AI gate check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("AI gate check passed.");
