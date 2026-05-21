import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDemoOperationsCheckpoints,
  getDemoOperationsLinks,
  getDemoConsoleLinks,
  getContractOperationLinks,
  getEnvironmentOperationLinks,
  getExportOperationLinks,
  getHealthOperationLinks,
  getIntegrationOperationAreas,
  getLaunchDashboardLinks,
  getNotificationOperationLinks,
  getOperatorSurfaceSummary,
  getQueueOperationLinks,
  getReleaseOperationSurfaceLinks,
  getReportingIndexLinks,
  getRunbookAdminLinks,
  getSecurityOperationLinks,
  getSettingsNavigationLinks,
  getValidationOperationLinks,
  getWorkflowOperationSteps,
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

  it("projects demo console links from the shared surface inventory without a self-link", () => {
    const launchLinks = getLaunchDashboardLinks();
    const demoLinks = getDemoConsoleLinks();
    const demoRoutes = demoLinks.map((link) => link.href);

    expect(demoLinks).toEqual(launchLinks.filter((link) => link.href !== "/demo"));
    expect(demoLinks).toHaveLength(34);
    expect(demoRoutes).not.toContain("/demo");
    expect(demoRoutes).toContain("/settings/exports");
    expect(demoRoutes).toContain("/settings");
    expect(demoRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects demo operations checkpoints and links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const checkpoints = getDemoOperationsCheckpoints();
    const operationLinks = getDemoOperationsLinks();
    const checkpointRoutes = checkpoints.map((checkpoint) => checkpoint.href);
    const operationRoutes = operationLinks.map((link) => link.href);

    expect(checkpoints).toHaveLength(5);
    expect(checkpointRoutes).toEqual([
      "/demo",
      "/settings/contacts",
      "/settings/campaigns",
      "/settings/inbox",
      "/settings/reports"
    ]);
    expect(checkpoints.map((checkpoint) => checkpoint.signal)).toEqual(
      checkpointRoutes.map((route) => inventoryLinks.find((link) => link.href === route)?.label)
    );
    expect(checkpoints.every((checkpoint) => checkpoint.name.length > 0 && checkpoint.boundary.length > 0)).toBe(true);
    expect(checkpointRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(operationLinks).toEqual([
      inventoryLinks.find((link) => link.href === "/settings/workflows"),
      inventoryLinks.find((link) => link.href === "/settings/operations"),
      inventoryLinks.find((link) => link.href === "/settings/releases"),
      inventoryLinks.find((link) => link.href === "/settings/environment")
    ]);
    expect(operationRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects reporting, workflow, and release links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const reportingLinks = getReportingIndexLinks();
    const workflowSteps = getWorkflowOperationSteps();
    const releaseLinks = getReleaseOperationSurfaceLinks();
    const reportingRoutes = reportingLinks.map((link) => link.href);
    const workflowRoutes = workflowSteps.map((step) => step.href);
    const releaseRoutes = releaseLinks.map((link) => link.href);

    expect(reportingRoutes).toEqual([
      "/settings/demo",
      "/settings/operations",
      "/settings/usage",
      "/settings/exports",
      "/settings/readiness-audit",
      "/settings/campaigns",
      "/settings/delivery",
      "/settings/workflows",
      "/settings/billing"
    ]);
    expect(reportingLinks).toEqual(reportingRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(reportingRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(workflowRoutes).toEqual([
      "/settings/contacts",
      "/settings/campaigns",
      "/settings/queue",
      "/settings/inbox",
      "/settings/delivery",
      "/settings/reports"
    ]);
    expect(workflowSteps.map((step) => step.owner)).toEqual(
      workflowRoutes.map((route) => inventoryLinks.find((link) => link.href === route)?.label)
    );
    expect(workflowSteps.every((step) => step.name.length > 0 && step.boundary.length > 0)).toBe(true);
    expect(workflowRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(releaseRoutes).toEqual([
      "/settings/demo",
      "/settings/validation",
      "/settings/contracts",
      "/settings/security",
      "/settings/system",
      "/settings/health",
      "/settings/runbook",
      "/settings/workflows"
    ]);
    expect(releaseLinks).toEqual(releaseRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(releaseRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects integration and security operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const integrationAreas = getIntegrationOperationAreas();
    const securityLinks = getSecurityOperationLinks();
    const integrationRoutes = integrationAreas.map((area) => area.href);
    const securityRoutes = securityLinks.map((link) => link.href);

    expect(integrationRoutes).toEqual([
      "/settings/provider",
      "/settings/numbers",
      "/settings/webhooks",
      "/settings/ai",
      "/settings/billing",
      "/settings/notifications"
    ]);
    expect(integrationAreas.map(({ href, label, note }) => ({ href, label, note }))).toEqual(
      integrationRoutes.map((route) => {
        const link = inventoryLinks.find((item) => item.href === route);
        return { href: link?.href, label: link?.label, note: link?.note };
      })
    );
    expect(integrationAreas.every((area) => area.state.length > 0 && area.boundary.length > 0)).toBe(true);
    expect(integrationRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(securityRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/system",
      "/settings/api",
      "/settings/contracts",
      "/settings/notifications",
      "/settings/validation",
      "/settings/runbook",
      "/settings/releases"
    ]);
    expect(securityLinks).toEqual(securityRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(securityRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects environment, health, contract, and validation operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const environmentLinks = getEnvironmentOperationLinks();
    const healthLinks = getHealthOperationLinks();
    const contractLinks = getContractOperationLinks();
    const validationLinks = getValidationOperationLinks();
    const environmentRoutes = environmentLinks.map((link) => link.href);
    const healthRoutes = healthLinks.map((link) => link.href);
    const contractRoutes = contractLinks.map((link) => link.href);
    const validationRoutes = validationLinks.map((link) => link.href);

    expect(environmentRoutes).toEqual([
      "/settings/system",
      "/settings/health",
      "/settings/security",
      "/settings/validation",
      "/settings/releases"
    ]);
    expect(environmentLinks).toEqual(environmentRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(environmentRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(healthRoutes).toEqual([
      "/settings/system",
      "/settings/api",
      "/settings/security",
      "/settings/validation"
    ]);
    expect(healthLinks).toEqual(healthRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(healthRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(contractRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/api",
      "/settings/security",
      "/settings/runbook",
      "/settings/validation"
    ]);
    expect(contractLinks).toEqual(contractRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(contractRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(validationRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/contracts",
      "/settings/runbook",
      "/settings/security",
      "/settings/releases"
    ]);
    expect(validationLinks).toEqual(validationRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(validationRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects queue and notification operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const queueLinks = getQueueOperationLinks();
    const notificationLinks = getNotificationOperationLinks();
    const queueRoutes = queueLinks.map((link) => link.href);
    const notificationRoutes = notificationLinks.map((link) => link.href);

    expect(queueRoutes).toEqual([
      "/settings",
      "/settings/campaigns",
      "/settings/system",
      "/settings/runbook",
      "/settings/workflows",
      "/settings/releases"
    ]);
    expect(queueLinks).toEqual(queueRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(queueRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(notificationRoutes).toEqual([
      "/settings",
      "/settings/security",
      "/settings/system",
      "/settings/integrations",
      "/settings/runbook",
      "/settings/releases"
    ]);
    expect(notificationLinks).toEqual(notificationRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(notificationRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects admin export operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const exportLinks = getExportOperationLinks();
    const exportRoutes = exportLinks.map((link) => link.href);

    expect(exportRoutes).toEqual([
      "/settings",
      "/settings/compliance",
      "/settings/readiness-audit",
      "/settings/system",
      "/settings/usage",
      "/settings/reports",
      "/settings/campaigns",
      "/settings/contacts",
      "/settings/templates",
      "/settings/audience",
      "/settings/inbox",
      "/settings/runbook"
    ]);
    expect(exportLinks).toEqual(exportRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(exportRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });
});
