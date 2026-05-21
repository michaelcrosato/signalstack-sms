import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLaunchDashboardLinks,
  getOperatorSurfaceSummary,
  getRunbookAdminLinks,
  getSettingsNavigationLinks,
  operatorSurfaceGroups
} from "@/lib/operations/operator-surfaces";

function routeToAppPagePath(route: string) {
  const routeSegments = route === "/" ? [] : route.split("/").filter(Boolean);
  return join(process.cwd(), "app", ...routeSegments, "page.tsx");
}

function collectPageRoutes(root: string) {
  const routes: string[] = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name === "page.tsx") {
        const relativeDirectory = relative(join(process.cwd(), "app"), directory);
        const route = `/${relativeDirectory.split(sep).filter(Boolean).join("/")}`;
        routes.push(route === "/" ? "/" : route);
      }
    }
  }

  walk(root);

  return routes.sort();
}

describe("operator surface inventory", () => {
  it("keeps the operations index grouped around the current local-only surfaces", () => {
    const summary = getOperatorSurfaceSummary();

    expect(summary.groupCount).toBe(4);
    expect(summary.surfaceCount).toBe(35);
    expect(new Set(summary.routes).size).toBe(summary.surfaceCount);
    expect(summary.routes).toEqual(
      expect.arrayContaining([
        "/settings/releases",
        "/settings/health",
        "/settings/environment",
        "/settings/security",
        "/settings/readiness-audit",
        "/settings/provider",
        "/settings/notifications"
      ])
    );
  });

  it("keeps every listed surface on a local route", () => {
    const links = operatorSurfaceGroups.flatMap((group) => group.links);

    expect(links.every((link) => link.href === "/" || link.href.startsWith("/"))).toBe(true);
    expect(links.every((link) => !link.href.startsWith("/api/"))).toBe(true);
    expect(links.every((link) => link.label.length > 0 && link.note.length > 0)).toBe(true);
  });

  it("points every listed app surface at an implemented page", () => {
    const routes = getOperatorSurfaceSummary().routes;
    const missingPages = routes.filter((route) => !existsSync(routeToAppPagePath(route)));

    expect(missingPages).toEqual([]);
  });

  it("lists every implemented local operator page in the shared inventory", () => {
    const inventoryRoutes = new Set(getOperatorSurfaceSummary().routes);
    const implementedOperatorRoutes = [
      ...collectPageRoutes(join(process.cwd(), "app", "settings")),
      "/demo"
    ].sort();

    expect(implementedOperatorRoutes.filter((route) => !inventoryRoutes.has(route))).toEqual([]);
  });

  it("projects runbook admin links from the shared settings surface inventory", () => {
    const sourceLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const runbookLinks = getRunbookAdminLinks();
    const runbookRoutes = runbookLinks.map((link) => link.href);
    const sourceSettingsLinks = sourceLinks.filter((link) => link.href === "/settings" || link.href.startsWith("/settings/"));

    expect(runbookLinks).toEqual(sourceSettingsLinks);
    expect(runbookLinks).toHaveLength(34);
    expect(sourceLinks.filter((link) => !runbookRoutes.includes(link.href)).map((link) => link.href)).toEqual(["/demo"]);
    expect(runbookLinks.every((link) => link.label.length > 0 && link.note.length > 0)).toBe(true);
    expect(runbookRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects go-live readiness navigation from the shared settings surface inventory", () => {
    const runbookLinks = getRunbookAdminLinks();
    const navigationLinks = getSettingsNavigationLinks();
    const navigationRoutes = navigationLinks.map((link) => link.href);

    expect(navigationLinks).toEqual(runbookLinks.filter((link) => link.href !== "/settings"));
    expect(navigationLinks).toHaveLength(33);
    expect(navigationRoutes).not.toContain("/settings");
    expect(navigationRoutes).not.toContain("/demo");
    expect(navigationRoutes).toEqual(
      expect.arrayContaining([
        "/settings/demo",
        "/settings/operations",
        "/settings/provider",
        "/settings/readiness-audit",
        "/settings/runbook"
      ])
    );
    expect(navigationRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects the launch dashboard from the full shared surface inventory", () => {
    const sourceLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const launchLinks = getLaunchDashboardLinks();
    const launchRoutes = launchLinks.map((link) => link.href);

    expect(launchLinks).toEqual(sourceLinks);
    expect(launchLinks).toHaveLength(35);
    expect(launchRoutes).toEqual(getOperatorSurfaceSummary().routes);
    expect(launchRoutes).toContain("/demo");
    expect(launchRoutes).toContain("/settings");
    expect(launchRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });
});
