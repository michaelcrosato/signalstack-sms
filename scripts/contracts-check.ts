import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

const appApiRoot = path.join("app", "api");
export const supportedRouteMethods = ["GET", "POST", "PATCH", "DELETE", "PUT"] as const;

export function extractExportedRouteMethods(source: string) {
  return supportedRouteMethods.filter((method) => {
    const directExportPattern = new RegExp(
      `export\\s+(?:(?:async\\s+)?function\\s+${method}\\b|const\\s+${method}\\b(?:\\s*:[\\s\\S]*?)?\\s*=)`
    );
    if (directExportPattern.test(source)) {
      return true;
    }

    const namedExportPattern = /export\s*\{([^}]+)\}/g;
    for (const match of source.matchAll(namedExportPattern)) {
      const exportedNames = match[1].split(",");
      for (const exportedName of exportedNames) {
        const aliasMatch = /^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(exportedName);
        if (aliasMatch !== null && aliasMatch[2] === method) {
          return true;
        }

        const directMatch = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(exportedName);
        if (directMatch !== null && directMatch[1] === method) {
          return true;
        }
      }
    }

    return false;
  });
}

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return listRouteFiles(entryPath);
    }
    return entry === "route.ts" ? [entryPath] : [];
  });
}

function routePathForFile(routeFile: string, routeRoot = appApiRoot) {
  const relativeDirectory = path.relative(routeRoot, path.dirname(routeFile));
  const parts = relativeDirectory
    .split(path.sep)
    .filter(Boolean)
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? `:${part.slice(1, -1)}` : part));

  return `/api/${parts.join("/")}`;
}

export function collectImplementedEndpoints(routeRoot = appApiRoot) {
  return listRouteFiles(routeRoot).flatMap((routeFile) => {
    const source = readFileSync(routeFile, "utf8");
    const routePath = routePathForFile(routeFile, routeRoot);
    return extractExportedRouteMethods(source).map((method) => `${method} ${routePath}`);
  });
}

export function runContractsCheck() {
  const missing = required.filter((contractPath) => !existsSync(contractPath));
  if (missing.length > 0) {
    console.error(`Missing contract files: ${missing.join(", ")}`);
    process.exit(1);
  }

  const apiDocs = [readFileSync("contracts/CONTRACT-API.md", "utf8"), readFileSync("docs/API_MAP.md", "utf8")];
  const implementedEndpoints = collectImplementedEndpoints();
  const undocumentedEndpoints = implementedEndpoints.filter((endpoint) => apiDocs.some((doc) => !doc.includes(endpoint)));

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
    "ProviderCredentialRotation",
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runContractsCheck();
}
