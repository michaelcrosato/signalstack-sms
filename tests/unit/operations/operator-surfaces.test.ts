import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getComplianceOperationLinks,
  getDemoConsoleLinks,
  getExportOperationLinks,
  getHealthOperationLinks,
  getLaunchDashboardLinks,
  getOperatorSurfaceSummary,
  getProviderOperationLinks,
  getQueueOperationLinks,
  getReadinessAuditOperationLinks,
  getRunbookAdminLinks,
  getSecurityOperationLinks,
  getSettingsNavigationLinks,
  getValidationOperationLinks,
  operatorSurfaceGroups,
  type OperatorSurfaceGroup,
  type OperatorSurfaceLink
} from "@/lib/operations/operator-surfaces";

// The operations inventory is the single source of truth for read-only operator surfaces. The real
// guarantees: a filesystem bijection between inventory routes and implemented pages, frozen metadata
// that callers cannot mutate, link projections backed by the inventory, and rejection of malformed
// supplied inventories. (The surface was consolidated in ULTRAPLAN Phase A / A3.)

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
        routes.push(`/${relativeDirectory.split(sep).filter(Boolean).join("/")}`);
      }
    }
  }
  walk(root);
  return routes.sort();
}

const inventoryRoutes = new Set(operatorSurfaceGroups.flatMap((group) => group.links.map((link) => link.href)));

const linkProjections: Array<{ name: string; run: () => readonly OperatorSurfaceLink[] }> = [
  { name: "runbook admin", run: getRunbookAdminLinks },
  { name: "settings navigation", run: getSettingsNavigationLinks },
  { name: "launch dashboard", run: getLaunchDashboardLinks },
  { name: "demo console", run: getDemoConsoleLinks },
  { name: "health", run: getHealthOperationLinks },
  { name: "security", run: getSecurityOperationLinks },
  { name: "validation", run: getValidationOperationLinks },
  { name: "queue", run: getQueueOperationLinks },
  { name: "provider", run: getProviderOperationLinks },
  { name: "compliance", run: getComplianceOperationLinks },
  { name: "readiness audit", run: getReadinessAuditOperationLinks },
  { name: "exports", run: getExportOperationLinks }
];

describe("operator surface inventory", () => {
  it("freezes the shared inventory, its groups, and links against runtime mutation", () => {
    expect(Object.isFrozen(operatorSurfaceGroups)).toBe(true);
    for (const group of operatorSurfaceGroups) {
      expect(Object.isFrozen(group)).toBe(true);
      expect(Object.isFrozen(group.links)).toBe(true);
      for (const link of group.links) {
        expect(Object.isFrozen(link)).toBe(true);
        expect(typeof link.href).toBe("string");
        expect(link.label.length).toBeGreaterThan(0);
        expect(link.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("points every listed app surface at an implemented page", () => {
    const missingPages = getOperatorSurfaceSummary().routes.filter((route) => !existsSync(routeToAppPagePath(route)));
    expect(missingPages).toEqual([]);
  });

  it("lists every implemented local operator page in the shared inventory", () => {
    const implementedOperatorRoutes = [...collectPageRoutes(join(process.cwd(), "app", "settings")), "/demo"].sort();
    expect(implementedOperatorRoutes.filter((route) => !inventoryRoutes.has(route))).toEqual([]);
  });

  it("exposes a summary whose routes match the inventory and are fresh per call", () => {
    const summary = getOperatorSurfaceSummary();
    expect(summary.routes).toEqual(operatorSurfaceGroups.flatMap((group) => group.links.map((link) => link.href)));
    expect(summary.routes.length).toBeGreaterThan(0);
    expect(getOperatorSurfaceSummary().routes).not.toBe(summary.routes);
  });

  it.each(linkProjections)("projects $name links backed by the inventory and real pages", ({ run }) => {
    const links = run();
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
    expect(Object.isFrozen(links)).toBe(true);
    expect(run()).not.toBe(links); // fresh array per call

    const hrefs = links.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length); // unique within projection
    for (const link of links) {
      expect(Object.isFrozen(link)).toBe(true);
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.note.length).toBeGreaterThan(0);
      expect(inventoryRoutes.has(link.href)).toBe(true); // backed by the shared inventory
      expect(existsSync(routeToAppPagePath(link.href))).toBe(true); // points at a real page
    }
  });

  it("keeps page-specific projections from linking to their own page", () => {
    const pageSpecific: Array<{ route: string; links: readonly OperatorSurfaceLink[] }> = [
      { route: "/settings/provider", links: getProviderOperationLinks() },
      { route: "/settings/compliance", links: getComplianceOperationLinks() }
    ];
    for (const projection of pageSpecific) {
      expect(projection.links.map((link) => link.href)).not.toContain(projection.route);
    }
  });

  it("does not mutate the shared inventory when a caller supplies its own", () => {
    const before = JSON.stringify(operatorSurfaceGroups);
    const supplied: OperatorSurfaceGroup[] = operatorSurfaceGroups.map((group) => ({
      name: group.name,
      links: group.links.map((link) => ({ ...link }))
    }));
    getLaunchDashboardLinks(supplied);
    expect(JSON.stringify(operatorSurfaceGroups)).toBe(before);
  });

  it("rejects malformed supplied inventories before projection", () => {
    const duplicateRoute: OperatorSurfaceGroup[] = [
      {
        name: "Duplicate",
        links: [
          { href: "/settings/health", label: "Health", note: "first" },
          { href: "/settings/health", label: "Health", note: "second" }
        ]
      }
    ];
    expect(() => getLaunchDashboardLinks([])).toThrow();
    expect(() => getLaunchDashboardLinks("not-an-array" as never)).toThrow();
    expect(() => getLaunchDashboardLinks(duplicateRoute)).toThrow();
  });
});
