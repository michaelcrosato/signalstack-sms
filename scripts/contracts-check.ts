import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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

const apiDocs = [
  readFileSync("contracts/CONTRACT-API.md", "utf8"),
  readFileSync("docs/API_MAP.md", "utf8")
];

const appApiRoot = path.join("app", "api");
const methodPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|DELETE|PUT)\b/g;

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return listRouteFiles(entryPath);
    }
    return entry === "route.ts" ? [entryPath] : [];
  });
}

function routePathForFile(routeFile: string) {
  const relativeDirectory = path.relative(appApiRoot, path.dirname(routeFile));
  const parts = relativeDirectory
    .split(path.sep)
    .filter(Boolean)
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? `:${part.slice(1, -1)}` : part));

  return `/api/${parts.join("/")}`;
}

const implementedEndpoints = listRouteFiles(appApiRoot).flatMap((routeFile) => {
  const source = readFileSync(routeFile, "utf8");
  const routePath = routePathForFile(routeFile);
  return Array.from(source.matchAll(methodPattern), (match) => `${match[1]} ${routePath}`);
});

const undocumentedEndpoints = implementedEndpoints.filter((endpoint) =>
  apiDocs.some((doc) => !doc.includes(endpoint))
);

if (undocumentedEndpoints.length > 0) {
  console.error(`Implemented API endpoints missing from contract docs: ${undocumentedEndpoints.join(", ")}`);
  process.exit(1);
}

const schema = readFileSync("prisma/schema.prisma", "utf8");
const tenantScopedModels = [
  "Contact",
  "Tag",
  "ContactTag",
  "ContactList",
  "ContactListMember",
  "Segment",
  "MessageTemplate",
  "ContactImport",
  "Campaign",
  "CampaignRecipient",
  "Conversation",
  "QueueJob",
  "Message",
  "InternalNote",
  "ComplianceProfile",
  "UsageEvent",
  "BillingAccount",
  "ProviderPhoneNumber",
  "ProviderCredential",
  "LiveReadinessAuditEvent",
  "WebhookEvent"
];

const modelsMissingOrgId = tenantScopedModels.filter((model) => {
  const modelPattern = new RegExp(`model\\s+${model}\\s+\\{([\\s\\S]*?)\\n\\}`, "m");
  const modelBlock = schema.match(modelPattern)?.[1];
  return !modelBlock || !/^\s*orgId\s+String\b/m.test(modelBlock);
});

if (modelsMissingOrgId.length > 0) {
  console.error(`Tenant-scoped models missing orgId: ${modelsMissingOrgId.join(", ")}`);
  process.exit(1);
}

console.log("Contract files present; API docs and tenant invariants verified.");
