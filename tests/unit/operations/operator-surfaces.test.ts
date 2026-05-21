import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAiOperationLinks,
  getAudienceOperationLinks,
  getBillingOperationLinks,
  getCampaignOperationLinks,
  getContactOperationLinks,
  getDemoOperationsCheckpoints,
  getDemoOperationsLinks,
  getDemoConsoleLinks,
  getContractOperationLinks,
  getDataOperationLinks,
  getEnvironmentOperationLinks,
  getExportOperationLinks,
  getHealthOperationLinks,
  getInboxOperationLinks,
  getIntegrationOperationAreas,
  getLaunchDashboardLinks,
  getNotificationOperationLinks,
  getNumberOperationLinks,
  getOperatorSurfaceSummary,
  getProviderOperationLinks,
  getQueueOperationLinks,
  getReadinessAuditOperationLinks,
  getReleaseOperationSurfaceLinks,
  getReportingIndexLinks,
  getRunbookAdminLinks,
  getSecurityOperationLinks,
  getSettingsNavigationLinks,
  getSystemOperationLinks,
  getTeamOperationLinks,
  getTemplateOperationLinks,
  getUsageOperationLinks,
  getValidationOperationLinks,
  getDeliveryOperationLinks,
  getComplianceOperationLinks,
  getWebhookOperationLinks,
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

  it("keeps every listed route in canonical static app-page form", () => {
    const links = operatorSurfaceGroups.flatMap((group) => group.links);
    const routes = links.map((link) => link.href);

    expect(routes.filter((route) => route !== route.toLowerCase())).toEqual([]);
    expect(routes.filter((route) => route.length > 1 && route.endsWith("/"))).toEqual([]);
    expect(routes.filter((route) => route.includes("?") || route.includes("#"))).toEqual([]);
    expect(routes.filter((route) => route.includes("[") || route.includes("]"))).toEqual([]);
    expect(routes.filter((route) => route.includes("//"))).toEqual([]);
    expect(routes.filter((route) => route !== "/demo" && route !== "/settings" && !route.startsWith("/settings/"))).toEqual([]);
  });

  it("keeps inventory group and route order stable for projected navigation", () => {
    expect(
      operatorSurfaceGroups.map((group) => ({
        name: group.name,
        routes: group.links.map((link) => link.href)
      }))
    ).toEqual([
      {
        name: "Demo And Workflow",
        routes: ["/demo", "/settings/demo", "/settings/workflows", "/settings/releases"]
      },
      {
        name: "Data And Messaging",
        routes: [
          "/settings/contacts",
          "/settings/audience",
          "/settings/templates",
          "/settings/campaigns",
          "/settings/queue",
          "/settings/inbox",
          "/settings/webhooks",
          "/settings/delivery"
        ]
      },
      {
        name: "Safety And Runtime",
        routes: [
          "/settings",
          "/settings/operations",
          "/settings/system",
          "/settings/environment",
          "/settings/health",
          "/settings/security",
          "/settings/validation",
          "/settings/contracts",
          "/settings/api"
        ]
      },
      {
        name: "Provider And Reporting",
        routes: [
          "/settings/provider",
          "/settings/numbers",
          "/settings/compliance",
          "/settings/readiness-audit",
          "/settings/exports",
          "/settings/reports",
          "/settings/usage",
          "/settings/billing",
          "/settings/ai",
          "/settings/notifications",
          "/settings/integrations",
          "/settings/team",
          "/settings/data",
          "/settings/runbook"
        ]
      }
    ]);
  });

  it("keeps inventory group names, labels, and notes unambiguous", () => {
    const groupNames = operatorSurfaceGroups.map((group) => group.name);
    const links = operatorSurfaceGroups.flatMap((group) => group.links);
    const labels = links.map((link) => link.label);
    const notes = links.map((link) => link.note);

    expect(new Set(groupNames).size).toBe(groupNames.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(notes).size).toBe(notes.length);
  });

  it("keeps operator inventory copy in a stable navigation format", () => {
    const titleCaseWords = /^[A-Z][A-Za-z0-9&-]*( (&|[A-Z][A-Za-z0-9&-]*))*$/;
    const noteFragment = /^[a-z0-9][A-Za-z0-9,& -]*$/;
    const links = operatorSurfaceGroups.flatMap((group) => group.links);

    expect(operatorSurfaceGroups.map((group) => group.name).filter((name) => !titleCaseWords.test(name))).toEqual([]);
    expect(links.map((link) => link.label).filter((label) => !titleCaseWords.test(label))).toEqual([]);
    expect(links.map((link) => link.note).filter((note) => !noteFragment.test(note))).toEqual([]);
    expect(links.map((link) => link.note).filter((note) => note.endsWith(".") || note.includes("  "))).toEqual([]);
  });

  it("keeps every projected operator navigation set unique and backed by the shared inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const inventoryRoutes = new Set(inventoryLinks.map((link) => link.href));
    const projectedLinkSets = [
      { name: "runbook", links: getRunbookAdminLinks() },
      { name: "settings", links: getSettingsNavigationLinks() },
      { name: "launch", links: getLaunchDashboardLinks() },
      { name: "demo console", links: getDemoConsoleLinks() },
      { name: "demo operations", links: getDemoOperationsLinks() },
      { name: "reporting", links: getReportingIndexLinks() },
      { name: "release", links: getReleaseOperationSurfaceLinks() },
      { name: "security", links: getSecurityOperationLinks() },
      { name: "environment", links: getEnvironmentOperationLinks() },
      { name: "health", links: getHealthOperationLinks() },
      { name: "contract", links: getContractOperationLinks() },
      { name: "validation", links: getValidationOperationLinks() },
      { name: "queue", links: getQueueOperationLinks() },
      { name: "contacts", links: getContactOperationLinks() },
      { name: "campaigns", links: getCampaignOperationLinks() },
      { name: "audience", links: getAudienceOperationLinks() },
      { name: "templates", links: getTemplateOperationLinks() },
      { name: "inbox", links: getInboxOperationLinks() },
      { name: "data", links: getDataOperationLinks() },
      { name: "notifications", links: getNotificationOperationLinks() },
      { name: "exports", links: getExportOperationLinks() },
      { name: "webhooks", links: getWebhookOperationLinks() },
      { name: "delivery", links: getDeliveryOperationLinks() },
      { name: "team", links: getTeamOperationLinks() },
      { name: "billing", links: getBillingOperationLinks() },
      { name: "ai", links: getAiOperationLinks() },
      { name: "provider", links: getProviderOperationLinks() },
      { name: "numbers", links: getNumberOperationLinks() },
      { name: "compliance", links: getComplianceOperationLinks() },
      { name: "system", links: getSystemOperationLinks() },
      { name: "usage", links: getUsageOperationLinks() },
      { name: "readiness audit", links: getReadinessAuditOperationLinks() }
    ];

    for (const projection of projectedLinkSets) {
      const routes = projection.links.map((link) => link.href);

      expect(new Set(routes).size, projection.name).toBe(routes.length);
      expect(routes.filter((route) => !inventoryRoutes.has(route)), projection.name).toEqual([]);
      expect(routes.filter((route) => !existsSync(routeToAppPagePath(route))), projection.name).toEqual([]);
      expect(projection.links, projection.name).toEqual(routes.map((route) => inventoryLinks.find((link) => link.href === route)));
    }
  });

  it("keeps projected operator navigation route order stable", () => {
    const stableProjectionOrders = [
      {
        name: "runbook",
        routes: getRunbookAdminLinks().map((link) => link.href),
        expectedRoutes: operatorSurfaceGroups
          .flatMap((group) => group.links)
          .filter((link) => link.href === "/settings" || link.href.startsWith("/settings/"))
          .map((link) => link.href)
      },
      {
        name: "settings",
        routes: getSettingsNavigationLinks().map((link) => link.href),
        expectedRoutes: getRunbookAdminLinks()
          .filter((link) => link.href !== "/settings")
          .map((link) => link.href)
      },
      {
        name: "launch",
        routes: getLaunchDashboardLinks().map((link) => link.href),
        expectedRoutes: getOperatorSurfaceSummary().routes
      },
      {
        name: "demo console",
        routes: getDemoConsoleLinks().map((link) => link.href),
        expectedRoutes: getOperatorSurfaceSummary().routes.filter((route) => route !== "/demo")
      },
      {
        name: "demo operations",
        routes: getDemoOperationsLinks().map((link) => link.href),
        expectedRoutes: ["/settings/workflows", "/settings/operations", "/settings/releases", "/settings/environment"]
      },
      {
        name: "reporting",
        routes: getReportingIndexLinks().map((link) => link.href),
        expectedRoutes: [
          "/settings/demo",
          "/settings/operations",
          "/settings/usage",
          "/settings/exports",
          "/settings/readiness-audit",
          "/settings/campaigns",
          "/settings/delivery",
          "/settings/workflows",
          "/settings/billing"
        ]
      },
      {
        name: "workflow",
        routes: getWorkflowOperationSteps().map((step) => step.href),
        expectedRoutes: [
          "/settings/contacts",
          "/settings/campaigns",
          "/settings/queue",
          "/settings/inbox",
          "/settings/delivery",
          "/settings/reports"
        ]
      },
      {
        name: "release",
        routes: getReleaseOperationSurfaceLinks().map((link) => link.href),
        expectedRoutes: [
          "/settings/demo",
          "/settings/validation",
          "/settings/contracts",
          "/settings/security",
          "/settings/system",
          "/settings/health",
          "/settings/runbook",
          "/settings/workflows"
        ]
      },
      {
        name: "integration",
        routes: getIntegrationOperationAreas().map((area) => area.href),
        expectedRoutes: [
          "/settings/provider",
          "/settings/numbers",
          "/settings/webhooks",
          "/settings/ai",
          "/settings/billing",
          "/settings/notifications"
        ]
      },
      {
        name: "security",
        routes: getSecurityOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/demo",
          "/settings",
          "/settings/system",
          "/settings/api",
          "/settings/contracts",
          "/settings/notifications",
          "/settings/validation",
          "/settings/runbook",
          "/settings/releases"
        ]
      },
      {
        name: "environment",
        routes: getEnvironmentOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings/system", "/settings/health", "/settings/security", "/settings/validation", "/settings/releases"]
      },
      {
        name: "health",
        routes: getHealthOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings/system", "/settings/api", "/settings/security", "/settings/validation"]
      },
      {
        name: "contract",
        routes: getContractOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/api", "/settings/security", "/settings/runbook", "/settings/validation"]
      },
      {
        name: "validation",
        routes: getValidationOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/contracts", "/settings/runbook", "/settings/security", "/settings/releases"]
      },
      {
        name: "queue",
        routes: getQueueOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings", "/settings/campaigns", "/settings/system", "/settings/runbook", "/settings/workflows", "/settings/releases"]
      },
      {
        name: "contacts",
        routes: getContactOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/demo",
          "/settings",
          "/settings/campaigns",
          "/settings/data",
          "/settings/templates",
          "/settings/audience",
          "/settings/inbox",
          "/settings/usage"
        ]
      },
      {
        name: "campaigns",
        routes: getCampaignOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/demo",
          "/settings",
          "/settings/usage",
          "/settings/queue",
          "/settings/contacts",
          "/settings/templates",
          "/settings/audience",
          "/settings/inbox",
          "/settings/delivery",
          "/settings/runbook"
        ]
      },
      {
        name: "audience",
        routes: getAudienceOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/contacts", "/settings/templates", "/settings/campaigns"]
      },
      {
        name: "templates",
        routes: getTemplateOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/contacts", "/settings/audience", "/settings/campaigns", "/settings/inbox", "/settings/runbook"]
      },
      {
        name: "inbox",
        routes: getInboxOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/demo",
          "/settings",
          "/settings/campaigns",
          "/settings/contacts",
          "/settings/templates",
          "/settings/audience",
          "/settings/usage",
          "/settings/team",
          "/settings/webhooks",
          "/settings/delivery"
        ]
      },
      {
        name: "data",
        routes: getDataOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/contacts", "/settings/exports", "/settings/security", "/settings/runbook"]
      },
      {
        name: "notifications",
        routes: getNotificationOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings", "/settings/security", "/settings/system", "/settings/integrations", "/settings/runbook", "/settings/releases"]
      },
      {
        name: "exports",
        routes: getExportOperationLinks().map((link) => link.href),
        expectedRoutes: [
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
        ]
      },
      {
        name: "webhooks",
        routes: getWebhookOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/system", "/settings/inbox", "/settings/delivery", "/settings/runbook"]
      },
      {
        name: "delivery",
        routes: getDeliveryOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/campaigns", "/settings/queue", "/settings/inbox", "/settings/webhooks"]
      },
      {
        name: "team",
        routes: getTeamOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/campaigns", "/settings/contacts", "/settings/inbox", "/settings/system", "/settings/runbook"]
      },
      {
        name: "billing",
        routes: getBillingOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/usage", "/settings/reports", "/settings/system", "/settings/runbook", "/settings/ai"]
      },
      {
        name: "ai",
        routes: getAiOperationLinks().map((link) => link.href),
        expectedRoutes: ["/demo", "/settings", "/settings/usage", "/settings/billing", "/settings/runbook"]
      },
      {
        name: "provider",
        routes: getProviderOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings", "/settings/integrations", "/settings/numbers", "/settings/compliance", "/settings/readiness-audit", "/settings/exports", "/settings/system"]
      },
      {
        name: "numbers",
        routes: getNumberOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings", "/settings/provider", "/settings/compliance", "/settings/system"]
      },
      {
        name: "compliance",
        routes: getComplianceOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/settings",
          "/settings/exports",
          "/settings/readiness-audit",
          "/settings/provider",
          "/settings/numbers",
          "/settings/system",
          "/settings/contacts",
          "/settings/templates",
          "/settings/audience"
        ]
      },
      {
        name: "system",
        routes: getSystemOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/settings",
          "/settings/compliance",
          "/settings/usage",
          "/settings/queue",
          "/settings/contacts",
          "/settings/templates",
          "/settings/audience",
          "/settings/health",
          "/settings/environment",
          "/settings/api",
          "/settings/security",
          "/settings/notifications",
          "/settings/runbook"
        ]
      },
      {
        name: "usage",
        routes: getUsageOperationLinks().map((link) => link.href),
        expectedRoutes: [
          "/settings",
          "/settings/compliance",
          "/settings/system",
          "/settings/campaigns",
          "/settings/contacts",
          "/settings/templates",
          "/settings/audience",
          "/settings/inbox",
          "/settings/runbook",
          "/settings/billing",
          "/settings/reports",
          "/settings/ai"
        ]
      },
      {
        name: "readiness audit",
        routes: getReadinessAuditOperationLinks().map((link) => link.href),
        expectedRoutes: ["/settings", "/settings/exports", "/settings/compliance", "/settings/provider"]
      }
    ];

    for (const projection of stableProjectionOrders) {
      expect(projection.routes, projection.name).toEqual(projection.expectedRoutes);
    }
  });

  it("keeps rich operator projections unique and backed by the shared inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const inventoryRoutes = new Set(inventoryLinks.map((link) => link.href));
    const richProjections = [
      {
        name: "demo operations checkpoints",
        entries: getDemoOperationsCheckpoints(),
        labels: getDemoOperationsCheckpoints().map((checkpoint) => checkpoint.signal)
      },
      {
        name: "workflow steps",
        entries: getWorkflowOperationSteps(),
        labels: getWorkflowOperationSteps().map((step) => step.owner)
      },
      {
        name: "integration areas",
        entries: getIntegrationOperationAreas(),
        labels: getIntegrationOperationAreas().map((area) => area.label)
      }
    ];

    for (const projection of richProjections) {
      const routes = projection.entries.map((entry) => entry.href);

      expect(new Set(routes).size, projection.name).toBe(routes.length);
      expect(routes.filter((route) => !inventoryRoutes.has(route)), projection.name).toEqual([]);
      expect(routes.filter((route) => !existsSync(routeToAppPagePath(route))), projection.name).toEqual([]);
      expect(projection.labels, projection.name).toEqual(routes.map((route) => inventoryLinks.find((link) => link.href === route)?.label));
    }
  });

  it("keeps page-specific operator navigation from linking to the current page", () => {
    const pageSpecificProjections = [
      { route: "/demo", links: getDemoConsoleLinks() },
      { route: "/settings", links: getSettingsNavigationLinks() },
      { route: "/settings/demo", links: getDemoOperationsLinks() },
      { route: "/settings/reports", links: getReportingIndexLinks() },
      { route: "/settings/workflows", links: getWorkflowOperationSteps() },
      { route: "/settings/releases", links: getReleaseOperationSurfaceLinks() },
      { route: "/settings/integrations", links: getIntegrationOperationAreas() },
      { route: "/settings/security", links: getSecurityOperationLinks() },
      { route: "/settings/environment", links: getEnvironmentOperationLinks() },
      { route: "/settings/health", links: getHealthOperationLinks() },
      { route: "/settings/contracts", links: getContractOperationLinks() },
      { route: "/settings/validation", links: getValidationOperationLinks() },
      { route: "/settings/queue", links: getQueueOperationLinks() },
      { route: "/settings/contacts", links: getContactOperationLinks() },
      { route: "/settings/campaigns", links: getCampaignOperationLinks() },
      { route: "/settings/audience", links: getAudienceOperationLinks() },
      { route: "/settings/templates", links: getTemplateOperationLinks() },
      { route: "/settings/inbox", links: getInboxOperationLinks() },
      { route: "/settings/data", links: getDataOperationLinks() },
      { route: "/settings/notifications", links: getNotificationOperationLinks() },
      { route: "/settings/exports", links: getExportOperationLinks() },
      { route: "/settings/webhooks", links: getWebhookOperationLinks() },
      { route: "/settings/delivery", links: getDeliveryOperationLinks() },
      { route: "/settings/team", links: getTeamOperationLinks() },
      { route: "/settings/billing", links: getBillingOperationLinks() },
      { route: "/settings/ai", links: getAiOperationLinks() },
      { route: "/settings/provider", links: getProviderOperationLinks() },
      { route: "/settings/numbers", links: getNumberOperationLinks() },
      { route: "/settings/compliance", links: getComplianceOperationLinks() },
      { route: "/settings/system", links: getSystemOperationLinks() },
      { route: "/settings/usage", links: getUsageOperationLinks() },
      { route: "/settings/readiness-audit", links: getReadinessAuditOperationLinks() }
    ];

    for (const projection of pageSpecificProjections) {
      const routes = projection.links.map((link) => link.href);

      expect(routes, projection.route).not.toContain(projection.route);
    }
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

  it("projects data and messaging operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const contactLinks = getContactOperationLinks();
    const campaignLinks = getCampaignOperationLinks();
    const audienceLinks = getAudienceOperationLinks();
    const templateLinks = getTemplateOperationLinks();
    const inboxLinks = getInboxOperationLinks();
    const dataLinks = getDataOperationLinks();
    const contactRoutes = contactLinks.map((link) => link.href);
    const campaignRoutes = campaignLinks.map((link) => link.href);
    const audienceRoutes = audienceLinks.map((link) => link.href);
    const templateRoutes = templateLinks.map((link) => link.href);
    const inboxRoutes = inboxLinks.map((link) => link.href);
    const dataRoutes = dataLinks.map((link) => link.href);

    expect(contactRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/campaigns",
      "/settings/data",
      "/settings/templates",
      "/settings/audience",
      "/settings/inbox",
      "/settings/usage"
    ]);
    expect(campaignRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/usage",
      "/settings/queue",
      "/settings/contacts",
      "/settings/templates",
      "/settings/audience",
      "/settings/inbox",
      "/settings/delivery",
      "/settings/runbook"
    ]);
    expect(audienceRoutes).toEqual(["/demo", "/settings", "/settings/contacts", "/settings/templates", "/settings/campaigns"]);
    expect(templateRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/contacts",
      "/settings/audience",
      "/settings/campaigns",
      "/settings/inbox",
      "/settings/runbook"
    ]);
    expect(inboxRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/campaigns",
      "/settings/contacts",
      "/settings/templates",
      "/settings/audience",
      "/settings/usage",
      "/settings/team",
      "/settings/webhooks",
      "/settings/delivery"
    ]);
    expect(dataRoutes).toEqual(["/demo", "/settings", "/settings/contacts", "/settings/exports", "/settings/security", "/settings/runbook"]);

    for (const routes of [contactRoutes, campaignRoutes, audienceRoutes, templateRoutes, inboxRoutes, dataRoutes]) {
      expect(routes.map((route) => inventoryLinks.find((link) => link.href === route)?.href)).toEqual(routes);
      expect(routes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
    }
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

  it("projects webhook, delivery, and team operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const webhookLinks = getWebhookOperationLinks();
    const deliveryLinks = getDeliveryOperationLinks();
    const teamLinks = getTeamOperationLinks();
    const webhookRoutes = webhookLinks.map((link) => link.href);
    const deliveryRoutes = deliveryLinks.map((link) => link.href);
    const teamRoutes = teamLinks.map((link) => link.href);

    expect(webhookRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/system",
      "/settings/inbox",
      "/settings/delivery",
      "/settings/runbook"
    ]);
    expect(webhookLinks).toEqual(webhookRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(webhookRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(deliveryRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/campaigns",
      "/settings/queue",
      "/settings/inbox",
      "/settings/webhooks"
    ]);
    expect(deliveryLinks).toEqual(deliveryRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(deliveryRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(teamRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/campaigns",
      "/settings/contacts",
      "/settings/inbox",
      "/settings/system",
      "/settings/runbook"
    ]);
    expect(teamLinks).toEqual(teamRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(teamRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects billing and AI operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const billingLinks = getBillingOperationLinks();
    const aiLinks = getAiOperationLinks();
    const billingRoutes = billingLinks.map((link) => link.href);
    const aiRoutes = aiLinks.map((link) => link.href);

    expect(billingRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/usage",
      "/settings/reports",
      "/settings/system",
      "/settings/runbook",
      "/settings/ai"
    ]);
    expect(billingLinks).toEqual(billingRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(billingRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);

    expect(aiRoutes).toEqual([
      "/demo",
      "/settings",
      "/settings/usage",
      "/settings/billing",
      "/settings/runbook"
    ]);
    expect(aiLinks).toEqual(aiRoutes.map((route) => inventoryLinks.find((link) => link.href === route)));
    expect(aiRoutes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
  });

  it("projects provider, compliance, runtime, and audit operation links from the shared surface inventory", () => {
    const inventoryLinks = operatorSurfaceGroups.flatMap((group) => group.links);
    const providerLinks = getProviderOperationLinks();
    const numberLinks = getNumberOperationLinks();
    const complianceLinks = getComplianceOperationLinks();
    const systemLinks = getSystemOperationLinks();
    const usageLinks = getUsageOperationLinks();
    const readinessAuditLinks = getReadinessAuditOperationLinks();
    const providerRoutes = providerLinks.map((link) => link.href);
    const numberRoutes = numberLinks.map((link) => link.href);
    const complianceRoutes = complianceLinks.map((link) => link.href);
    const systemRoutes = systemLinks.map((link) => link.href);
    const usageRoutes = usageLinks.map((link) => link.href);
    const readinessAuditRoutes = readinessAuditLinks.map((link) => link.href);

    expect(providerRoutes).toEqual([
      "/settings",
      "/settings/integrations",
      "/settings/numbers",
      "/settings/compliance",
      "/settings/readiness-audit",
      "/settings/exports",
      "/settings/system"
    ]);
    expect(numberRoutes).toEqual(["/settings", "/settings/provider", "/settings/compliance", "/settings/system"]);
    expect(complianceRoutes).toEqual([
      "/settings",
      "/settings/exports",
      "/settings/readiness-audit",
      "/settings/provider",
      "/settings/numbers",
      "/settings/system",
      "/settings/contacts",
      "/settings/templates",
      "/settings/audience"
    ]);
    expect(systemRoutes).toEqual([
      "/settings",
      "/settings/compliance",
      "/settings/usage",
      "/settings/queue",
      "/settings/contacts",
      "/settings/templates",
      "/settings/audience",
      "/settings/health",
      "/settings/environment",
      "/settings/api",
      "/settings/security",
      "/settings/notifications",
      "/settings/runbook"
    ]);
    expect(usageRoutes).toEqual([
      "/settings",
      "/settings/compliance",
      "/settings/system",
      "/settings/campaigns",
      "/settings/contacts",
      "/settings/templates",
      "/settings/audience",
      "/settings/inbox",
      "/settings/runbook",
      "/settings/billing",
      "/settings/reports",
      "/settings/ai"
    ]);
    expect(readinessAuditRoutes).toEqual(["/settings", "/settings/exports", "/settings/compliance", "/settings/provider"]);

    for (const routes of [providerRoutes, numberRoutes, complianceRoutes, systemRoutes, usageRoutes, readinessAuditRoutes]) {
      expect(routes.map((route) => inventoryLinks.find((link) => link.href === route)?.href)).toEqual(routes);
      expect(routes.filter((route) => !existsSync(routeToAppPagePath(route)))).toEqual([]);
    }
  });
});
