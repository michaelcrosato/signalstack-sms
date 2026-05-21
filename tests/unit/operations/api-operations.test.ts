import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { allowedApiOperationMethods, apiOperationRoutes, getApiOperationsStatus } from "@/lib/operations/api-operations";

const publicApiOperationRouteFields = ["method", "path", "area", "mutates", "externalImpact", "safety"];
const publicApiOperationsStatusFields = [
  "routeCount",
  "mutatingRouteCount",
  "externalImpactRouteCount",
  "rateLimit",
  "routes"
];
const publicApiRateLimitFields = ["enabled", "limit", "windowSeconds"];

function sortedFields(value: object) {
  return Object.keys(value).sort();
}

function apiPathToRouteFile(apiPath: string) {
  const routeSegments = apiPath.split("/").filter(Boolean);
  return join(process.cwd(), "app", ...routeSegments, "route.ts");
}

function collectImplementedApiRouteMethods(root: string) {
  const routeMethods: string[] = [];
  const supportedMethods = ["GET", "POST", "PATCH", "DELETE"] as const;

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name === "route.ts") {
        const source = readFileSync(fullPath, "utf8");
        const relativeRoute = relative(join(process.cwd(), "app"), fullPath).split(sep).join("/").replace(/\/route\.ts$/, "");
        const routePath = `/${relativeRoute}`;

        for (const method of supportedMethods) {
          const methodExportPattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`);

          if (methodExportPattern.test(source)) {
            routeMethods.push(`${method} ${routePath}`);
          }
        }
      }
    }
  }

  walk(root);

  return routeMethods.sort();
}

describe("getApiOperationsStatus", () => {
  it("reports local API route inventory and keeps external impact at zero", () => {
    const status = getApiOperationsStatus({});

    expect(status.routeCount).toBe(47);
    expect(status.mutatingRouteCount).toBeGreaterThan(10);
    expect(status.externalImpactRouteCount).toBe(0);
    expect(status.routes.every((route) => route.path.startsWith("/api/"))).toBe(true);
    expect(status.routes.some((route) => route.path === "/api/webhooks/twilio/inbound")).toBe(true);
    expect(status.routes.some((route) => route.path === "/api/settings/provider/rotations/export")).toBe(true);
    expect(status.routes.map((route) => `${route.method} ${route.path}`)).toEqual(
      expect.arrayContaining([
        "DELETE /api/contacts/[contactId]",
        "PATCH /api/campaigns/[campaignId]",
        "GET /api/inbox/conversations/[conversationId]/messages",
        "GET /api/inbox/conversations/[conversationId]/notes",
        "GET /api/billing/usage"
      ])
    );
    expect(status.rateLimit).toMatchObject({
      enabled: true,
      limit: 120,
      windowSeconds: 60
    });
  });

  it("keeps API inventory entries unique and backed by implemented route files", () => {
    const routeKeys = apiOperationRoutes.map((route) => `${route.method} ${route.path}`);
    const missingRouteFiles = apiOperationRoutes
      .map((route) => route.path)
      .filter((path, index, paths) => paths.indexOf(path) === index)
      .filter((path) => !existsSync(apiPathToRouteFile(path)));

    expect(new Set(routeKeys).size).toBe(routeKeys.length);
    expect(missingRouteFiles).toEqual([]);
  });

  it("keeps API inventory values in a canonical local route shape", () => {
    const routeKeys = apiOperationRoutes.map((route) => `${route.method} ${route.path}`);

    expect(apiOperationRoutes.every((route) => allowedApiOperationMethods.includes(route.method))).toBe(true);
    expect(apiOperationRoutes.map((route) => route.path).filter((path) => !path.startsWith("/api/"))).toEqual([]);
    expect(apiOperationRoutes.map((route) => route.path).filter((path) => path.endsWith("/"))).toEqual([]);
    expect(apiOperationRoutes.map((route) => route.path).filter((path) => path.includes("?") || path.includes("#"))).toEqual([]);
    expect(apiOperationRoutes.map((route) => route.path).filter((path) => path.includes("//"))).toEqual([]);
    expect(apiOperationRoutes.map((route) => route.area).filter((area) => area.trim().length === 0)).toEqual([]);
    expect(apiOperationRoutes.map((route) => route.safety).filter((safety) => safety.trim().length === 0)).toEqual([]);
    expect(apiOperationRoutes.filter((route) => typeof route.mutates !== "boolean" || typeof route.externalImpact !== "boolean")).toEqual([]);
    expect(new Set(routeKeys).size).toBe(routeKeys.length);
  });

  it("keeps API inventory static metadata whitespace-clean", () => {
    const staticCopy = apiOperationRoutes.flatMap((route) => [route.path, route.area, route.safety]);

    expect(staticCopy.filter((copy) => copy.trim().length === 0)).toEqual([]);
    expect(staticCopy.filter((copy) => copy !== copy.trim())).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("\n") || copy.includes("\r"))).toEqual([]);
    expect(staticCopy.filter((copy) => copy.includes("  "))).toEqual([]);
  });

  it("keeps API inventory static metadata free of secret-like literals", () => {
    const staticCopy = apiOperationRoutes.flatMap((route) => [route.path, route.area, route.safety]);
    const secretLikePatterns = [
      /\bsk_(?:live|test)_[A-Za-z0-9]+/,
      /\bpk_live_[A-Za-z0-9]+/,
      /\bAC[a-fA-F0-9]{32}\b/,
      /\b(?:TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLERK_SECRET_KEY)\s*=/,
      /\bBearer\s+[A-Za-z0-9._-]{12,}/
    ];

    expect(staticCopy.filter((copy) => secretLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });

  it("keeps API inventory static metadata free of command-like literals", () => {
    const staticCopy = apiOperationRoutes.flatMap((route) => [route.path, route.area, route.safety]);
    const commandLikePatterns = [
      /\bnpm\s+run\b/i,
      /\bnpx\b/i,
      /\bpowershell\b/i,
      /\bcurl\b/i,
      /\bInvoke-WebRequest\b/i
    ];

    expect(staticCopy.filter((copy) => commandLikePatterns.some((pattern) => pattern.test(copy)))).toEqual([]);
  });

  it("keeps API inventory route order stable for local review pages", () => {
    expect(apiOperationRoutes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /api/health",
      "GET /api/orgs/current",
      "GET /api/contacts",
      "POST /api/contacts",
      "GET /api/contacts/[contactId]",
      "PATCH /api/contacts/[contactId]",
      "DELETE /api/contacts/[contactId]",
      "POST /api/contacts/imports",
      "GET /api/templates",
      "POST /api/templates",
      "GET /api/campaigns",
      "POST /api/campaigns",
      "GET /api/campaigns/[campaignId]",
      "PATCH /api/campaigns/[campaignId]",
      "POST /api/campaigns/[campaignId]/preflight",
      "POST /api/campaigns/[campaignId]/schedule",
      "POST /api/campaigns/[campaignId]/cancel",
      "GET /api/inbox/conversations",
      "POST /api/inbox/conversations",
      "GET /api/inbox/conversations/[conversationId]",
      "GET /api/inbox/conversations/[conversationId]/messages",
      "POST /api/inbox/conversations/[conversationId]/messages",
      "POST /api/inbox/conversations/[conversationId]/assign",
      "GET /api/inbox/conversations/[conversationId]/notes",
      "POST /api/inbox/conversations/[conversationId]/notes",
      "POST /api/inbox/conversations/[conversationId]/resolve",
      "POST /api/demo/inbound",
      "POST /api/ai/campaign-copy",
      "POST /api/ai/reply-suggestion",
      "POST /api/ai/conversation-summary",
      "POST /api/ai/lead-qualification",
      "GET /api/analytics/overview",
      "GET /api/billing/usage",
      "POST /api/billing/usage",
      "GET /api/settings/compliance",
      "PATCH /api/settings/compliance",
      "GET /api/settings/numbers",
      "POST /api/settings/numbers",
      "GET /api/settings/provider",
      "PATCH /api/settings/provider",
      "DELETE /api/settings/provider",
      "GET /api/settings/provider/rotations",
      "GET /api/settings/provider/rotations/export",
      "GET /api/settings/readiness-audit",
      "GET /api/settings/readiness-audit/export",
      "POST /api/webhooks/twilio/inbound",
      "POST /api/webhooks/twilio/status"
    ]);
  });

  it("keeps the exported API inventory frozen against runtime mutation", () => {
    const firstRoute = apiOperationRoutes[0];

    expect(Object.isFrozen(apiOperationRoutes)).toBe(true);
    expect(apiOperationRoutes.every((route) => Object.isFrozen(route))).toBe(true);
    expect(() =>
      (apiOperationRoutes as unknown as typeof apiOperationRoutes[number][]).push({
        method: "GET",
        path: "/api/unsafe",
        area: "Unsafe",
        mutates: false,
        externalImpact: false,
        safety: "unsafe mutation"
      })
    ).toThrow(TypeError);
    expect(() => ((firstRoute as { path: string }).path = "/api/unsafe")).toThrow(TypeError);
  });

  it("exports a frozen supported API method vocabulary aligned with the route inventory", () => {
    const routeMethods = Array.from(new Set(apiOperationRoutes.map((route) => route.method))).sort();

    expect(Object.isFrozen(allowedApiOperationMethods)).toBe(true);
    expect([...allowedApiOperationMethods].sort()).toEqual(["DELETE", "GET", "PATCH", "POST"]);
    expect(routeMethods).toEqual([...allowedApiOperationMethods].sort());
    expect(() => (allowedApiOperationMethods as unknown as string[]).push("PUT")).toThrow(TypeError);
  });

  it("exposes only public API inventory route fields", () => {
    const expectedFields = [...publicApiOperationRouteFields].sort();

    expect(apiOperationRoutes.every((route) => sortedFields(route).join("|") === expectedFields.join("|"))).toBe(true);
  });

  it("returns fresh frozen API route snapshots per status call", () => {
    const firstStatus = getApiOperationsStatus({});
    const secondStatus = getApiOperationsStatus({});
    const firstRoute = firstStatus.routes[0];

    expect(Object.isFrozen(firstStatus.routes)).toBe(true);
    expect(firstStatus.routes.every((route) => Object.isFrozen(route))).toBe(true);
    expect(firstStatus.routes).not.toBe(secondStatus.routes);
    expect(firstStatus.routes[0]).not.toBe(apiOperationRoutes[0]);
    expect(firstStatus.routes).toEqual(secondStatus.routes);
    expect(() => (firstStatus.routes as unknown as Array<(typeof apiOperationRoutes)[number]>).pop()).toThrow(TypeError);
    expect(() => ((firstRoute as { safety: string }).safety = "unsafe mutation")).toThrow(TypeError);
    expect(getApiOperationsStatus({}).routes[0].safety).toBe(apiOperationRoutes[0].safety);
  });

  it("exposes only public API status snapshot fields", () => {
    const status = getApiOperationsStatus({});
    const expectedRouteFields = [...publicApiOperationRouteFields].sort();

    expect(sortedFields(status)).toEqual([...publicApiOperationsStatusFields].sort());
    expect(sortedFields(status.rateLimit)).toEqual([...publicApiRateLimitFields].sort());
    expect(status.routes.every((route) => sortedFields(route).join("|") === expectedRouteFields.join("|"))).toBe(true);
  });

  it("lists every implemented local API route method in the inventory", () => {
    const inventoryRouteKeys = new Set(apiOperationRoutes.map((route) => `${route.method} ${route.path}`));
    const implementedRouteMethods = collectImplementedApiRouteMethods(join(process.cwd(), "app", "api"));

    expect(implementedRouteMethods).toHaveLength(47);
    expect(implementedRouteMethods.filter((routeMethod) => !inventoryRouteKeys.has(routeMethod))).toEqual([]);
  });

  it("surfaces bounded API rate limit settings", () => {
    const status = getApiOperationsStatus({
      API_RATE_LIMIT_ENABLED: "false",
      API_RATE_LIMIT_MAX: "25",
      API_RATE_LIMIT_WINDOW_MS: "5000"
    });

    expect(status.rateLimit).toMatchObject({
      enabled: false,
      limit: 25,
      windowSeconds: 5
    });
  });
});
