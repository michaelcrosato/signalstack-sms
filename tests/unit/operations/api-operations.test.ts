import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { apiOperationRoutes, getApiOperationsStatus } from "@/lib/operations/api-operations";

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
