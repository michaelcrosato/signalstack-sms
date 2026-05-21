import { getApiRateLimitPolicy } from "@/lib/rate-limit/api-rate-limit";

export const allowedApiOperationMethods = Object.freeze(["GET", "POST", "PATCH", "DELETE"] as const);

export type ApiOperationMethod = (typeof allowedApiOperationMethods)[number];

export type ApiOperationRoute = {
  method: ApiOperationMethod;
  path: string;
  area: string;
  mutates: boolean;
  externalImpact: boolean;
  safety: string;
};

export type ApiOperationsStatus = {
  routeCount: number;
  mutatingRouteCount: number;
  externalImpactRouteCount: number;
  rateLimit: {
    enabled: boolean;
    limit: number;
    windowSeconds: number;
  };
  routes: readonly ApiOperationRoute[];
};

const apiOperationRouteFields = ["method", "path", "area", "mutates", "externalImpact", "safety"] as const;
const forbiddenApiOperationCommandPatterns = [
  /\bnpm\s+run\b/i,
  /\bnpx\b/i,
  /\bpowershell\b/i,
  /\bcurl\b/i,
  /\bInvoke-WebRequest\b/i
] as const;
const forbiddenApiOperationSecretPatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]+/,
  /\bpk_live_[A-Za-z0-9]+/,
  /\bAC[a-fA-F0-9]{32}\b/,
  /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/
] as const;

function assertExactApiOperationRouteFields(route: ApiOperationRoute) {
  const actualKeys = Reflect.ownKeys(route);

  if (
    actualKeys.length !== apiOperationRouteFields.length ||
    actualKeys.some((key) => !apiOperationRouteFields.includes(key as typeof apiOperationRouteFields[number]))
  ) {
    throw new Error("Invalid API operation route fields");
  }
}

function assertApiOperationRoute(route: ApiOperationRoute) {
  assertExactApiOperationRouteFields(route);

  if (!allowedApiOperationMethods.includes(route.method)) {
    throw new Error(`Invalid API operation method ${String(route.method)}`);
  }

  if (
    typeof route.path !== "string" ||
    !route.path.startsWith("/api/") ||
    route.path.endsWith("/") ||
    route.path.includes("?") ||
    route.path.includes("#") ||
    route.path.includes("//")
  ) {
    throw new Error(`Invalid API operation path ${String(route.path)}`);
  }

  if (typeof route.area !== "string" || route.area.trim().length === 0) {
    throw new Error("Invalid API operation area");
  }

  if (typeof route.mutates !== "boolean" || typeof route.externalImpact !== "boolean") {
    throw new Error(`Invalid API operation flags for ${route.method} ${route.path}`);
  }

  if (typeof route.safety !== "string" || route.safety.trim().length === 0) {
    throw new Error(`Invalid API operation safety for ${route.method} ${route.path}`);
  }

  for (const [label, value] of [
    ["path", route.path],
    ["area", route.area],
    ["safety", route.safety]
  ] as const) {
    assertCleanApiOperationCopy(value, `Whitespace-unsafe API operation ${label} for ${route.method} ${route.path}`);
    assertNoApiOperationSecretLikeCopy(value, `Secret-like API operation ${label} for ${route.method} ${route.path}`);
    assertNoApiOperationCommandLikeCopy(value, `Command-like API operation ${label} for ${route.method} ${route.path}`);
  }
}

function assertCleanApiOperationCopy(value: string, errorMessage: string) {
  if (value !== value.trim() || value.includes("\n") || value.includes("\r") || value.includes("  ")) {
    throw new Error(errorMessage);
  }
}

function assertNoApiOperationSecretLikeCopy(value: string, errorMessage: string) {
  if (forbiddenApiOperationSecretPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertNoApiOperationCommandLikeCopy(value: string, errorMessage: string) {
  if (forbiddenApiOperationCommandPatterns.some((pattern) => pattern.test(value))) {
    throw new Error(errorMessage);
  }
}

function assertUniqueApiOperationRoutes(routes: readonly ApiOperationRoute[]) {
  const seenRoutes = new Set<string>();

  for (const route of routes) {
    const routeKey = `${route.method} ${route.path}`;

    if (seenRoutes.has(routeKey)) {
      throw new Error(`Duplicate API operation route ${routeKey}`);
    }

    seenRoutes.add(routeKey);
  }
}

function freezeApiOperationRoute(route: ApiOperationRoute) {
  return Object.freeze({
    method: route.method,
    path: route.path,
    area: route.area,
    mutates: route.mutates,
    externalImpact: route.externalImpact,
    safety: route.safety
  });
}

function freezeApiOperationRoutes(routes: ApiOperationRoute[]) {
  for (const route of routes) {
    assertApiOperationRoute(route);
  }

  assertUniqueApiOperationRoutes(routes);

  return Object.freeze(routes.map((route) => freezeApiOperationRoute(route)));
}

export const apiOperationRoutes = freezeApiOperationRoutes([
  { method: "GET", path: "/api/health", area: "System", mutates: false, externalImpact: false, safety: "local health metadata only" },
  { method: "GET", path: "/api/orgs/current", area: "Tenant", mutates: true, externalImpact: false, safety: "demo org bootstrap only" },
  { method: "GET", path: "/api/contacts", area: "Contacts", mutates: false, externalImpact: false, safety: "tenant-scoped local records" },
  { method: "POST", path: "/api/contacts", area: "Contacts", mutates: true, externalImpact: false, safety: "local contact write only" },
  { method: "GET", path: "/api/contacts/[contactId]", area: "Contacts", mutates: false, externalImpact: false, safety: "tenant-scoped local record" },
  { method: "PATCH", path: "/api/contacts/[contactId]", area: "Contacts", mutates: true, externalImpact: false, safety: "local contact write only" },
  { method: "DELETE", path: "/api/contacts/[contactId]", area: "Contacts", mutates: true, externalImpact: false, safety: "local soft archive only" },
  { method: "POST", path: "/api/contacts/imports", area: "Contacts", mutates: true, externalImpact: false, safety: "local CSV import only" },
  { method: "GET", path: "/api/templates", area: "Templates", mutates: false, externalImpact: false, safety: "tenant-scoped local records" },
  { method: "POST", path: "/api/templates", area: "Templates", mutates: true, externalImpact: false, safety: "local template write only" },
  { method: "GET", path: "/api/campaigns", area: "Campaigns", mutates: false, externalImpact: false, safety: "tenant-scoped local records" },
  { method: "POST", path: "/api/campaigns", area: "Campaigns", mutates: true, externalImpact: false, safety: "local draft creation only" },
  { method: "GET", path: "/api/campaigns/[campaignId]", area: "Campaigns", mutates: false, externalImpact: false, safety: "tenant-scoped local record" },
  { method: "PATCH", path: "/api/campaigns/[campaignId]", area: "Campaigns", mutates: true, externalImpact: false, safety: "local draft update only" },
  { method: "POST", path: "/api/campaigns/[campaignId]/preflight", area: "Campaigns", mutates: false, externalImpact: false, safety: "hard-gate evaluation only" },
  { method: "POST", path: "/api/campaigns/[campaignId]/schedule", area: "Campaigns", mutates: true, externalImpact: false, safety: "local queue job only" },
  { method: "POST", path: "/api/campaigns/[campaignId]/cancel", area: "Campaigns", mutates: true, externalImpact: false, safety: "local queue cancellation only" },
  { method: "GET", path: "/api/inbox/conversations", area: "Inbox", mutates: false, externalImpact: false, safety: "tenant-scoped local records" },
  { method: "POST", path: "/api/inbox/conversations", area: "Inbox", mutates: true, externalImpact: false, safety: "local conversation write only" },
  { method: "GET", path: "/api/inbox/conversations/[conversationId]", area: "Inbox", mutates: false, externalImpact: false, safety: "tenant-scoped local record" },
  { method: "GET", path: "/api/inbox/conversations/[conversationId]/messages", area: "Inbox", mutates: false, externalImpact: false, safety: "tenant-scoped local messages" },
  { method: "POST", path: "/api/inbox/conversations/[conversationId]/messages", area: "Inbox", mutates: true, externalImpact: false, safety: "local inbound/demo message only" },
  { method: "POST", path: "/api/inbox/conversations/[conversationId]/assign", area: "Inbox", mutates: true, externalImpact: false, safety: "local assignment only" },
  { method: "GET", path: "/api/inbox/conversations/[conversationId]/notes", area: "Inbox", mutates: false, externalImpact: false, safety: "tenant-scoped local internal notes" },
  { method: "POST", path: "/api/inbox/conversations/[conversationId]/notes", area: "Inbox", mutates: true, externalImpact: false, safety: "local internal note only" },
  { method: "POST", path: "/api/inbox/conversations/[conversationId]/resolve", area: "Inbox", mutates: true, externalImpact: false, safety: "local status update only" },
  { method: "POST", path: "/api/demo/inbound", area: "Demo", mutates: true, externalImpact: false, safety: "local simulated inbound only" },
  { method: "POST", path: "/api/ai/campaign-copy", area: "AI", mutates: false, externalImpact: false, safety: "fake provider by default" },
  { method: "POST", path: "/api/ai/reply-suggestion", area: "AI", mutates: false, externalImpact: false, safety: "fake provider by default" },
  { method: "POST", path: "/api/ai/conversation-summary", area: "AI", mutates: false, externalImpact: false, safety: "fake provider by default" },
  { method: "POST", path: "/api/ai/lead-qualification", area: "AI", mutates: false, externalImpact: false, safety: "fake provider by default" },
  { method: "GET", path: "/api/analytics/overview", area: "Analytics", mutates: false, externalImpact: false, safety: "local aggregate reads only" },
  { method: "GET", path: "/api/billing/usage", area: "Billing", mutates: false, externalImpact: false, safety: "local billing and usage metadata" },
  { method: "POST", path: "/api/billing/usage", area: "Billing", mutates: true, externalImpact: false, safety: "local metering only" },
  { method: "GET", path: "/api/settings/compliance", area: "Settings", mutates: false, externalImpact: false, safety: "local compliance metadata" },
  { method: "PATCH", path: "/api/settings/compliance", area: "Settings", mutates: true, externalImpact: false, safety: "local compliance metadata only" },
  { method: "GET", path: "/api/settings/numbers", area: "Settings", mutates: false, externalImpact: false, safety: "local provider-number metadata" },
  { method: "POST", path: "/api/settings/numbers", area: "Settings", mutates: true, externalImpact: false, safety: "local provider-number metadata only" },
  { method: "GET", path: "/api/settings/provider", area: "Settings", mutates: false, externalImpact: false, safety: "redacted local credential metadata" },
  { method: "PATCH", path: "/api/settings/provider", area: "Settings", mutates: true, externalImpact: false, safety: "redacted metadata only" },
  { method: "DELETE", path: "/api/settings/provider", area: "Settings", mutates: true, externalImpact: false, safety: "local metadata deletion only" },
  { method: "GET", path: "/api/settings/provider/rotations", area: "Settings", mutates: false, externalImpact: false, safety: "redacted local history" },
  { method: "GET", path: "/api/settings/provider/rotations/export", area: "Settings", mutates: false, externalImpact: false, safety: "redacted local CSV" },
  { method: "GET", path: "/api/settings/readiness-audit", area: "Settings", mutates: false, externalImpact: false, safety: "local audit metadata" },
  { method: "GET", path: "/api/settings/readiness-audit/export", area: "Settings", mutates: false, externalImpact: false, safety: "local audit CSV" },
  { method: "POST", path: "/api/webhooks/twilio/inbound", area: "Webhooks", mutates: true, externalImpact: false, safety: "idempotent local inbound handling" },
  { method: "POST", path: "/api/webhooks/twilio/status", area: "Webhooks", mutates: true, externalImpact: false, safety: "idempotent local status handling" }
]);

export function getApiOperationsStatus(env: Record<string, string | undefined> = process.env): ApiOperationsStatus {
  const rateLimit = getApiRateLimitPolicy(env);

  return {
    routeCount: apiOperationRoutes.length,
    mutatingRouteCount: apiOperationRoutes.filter((route) => route.mutates).length,
    externalImpactRouteCount: apiOperationRoutes.filter((route) => route.externalImpact).length,
    rateLimit: {
      enabled: rateLimit.enabled,
      limit: rateLimit.limit,
      windowSeconds: rateLimit.windowMs / 1000
    },
    routes: freezeApiOperationRoutes(apiOperationRoutes.map((route) => ({ ...route })))
  };
}
