export type OperatorSurfaceLink = {
  href: string;
  label: string;
  note: string;
};

export type OperatorSurfaceGroup = {
  name: string;
  links: OperatorSurfaceLink[];
};

export const operatorSurfaceGroups = [
  {
    name: "Demo And Workflow",
    links: [
      { href: "/demo", label: "Demo Console", note: "seeded investor path" },
      { href: "/settings/demo", label: "Demo Operations", note: "seed readiness and runtime gates" },
      { href: "/settings/workflows", label: "Workflow Operations", note: "local workflow checkpoints" },
      { href: "/settings/releases", label: "Release Operations", note: "release gate references" }
    ]
  },
  {
    name: "Data And Messaging",
    links: [
      { href: "/settings/contacts", label: "Contact Operations", note: "consent and import metadata" },
      { href: "/settings/audience", label: "Audience Operations", note: "tags, lists, and segments" },
      { href: "/settings/templates", label: "Template Operations", note: "template variables and usage" },
      { href: "/settings/campaigns", label: "Campaign Operations", note: "campaign and queue state" },
      { href: "/settings/queue", label: "Queue Operations", note: "scheduled job metadata" },
      { href: "/settings/inbox", label: "Inbox Operations", note: "conversation status and notes" },
      { href: "/settings/webhooks", label: "Webhook Operations", note: "stored webhook metadata" },
      { href: "/settings/delivery", label: "Delivery Operations", note: "message delivery state" }
    ]
  },
  {
    name: "Safety And Runtime",
    links: [
      { href: "/settings", label: "Go-Live Readiness", note: "provider and compliance blockers" },
      { href: "/settings/operations", label: "Operations Index", note: "grouped local operator surfaces" },
      { href: "/settings/system", label: "System Status", note: "runtime flags and queue backend" },
      { href: "/settings/environment", label: "Environment Operations", note: "safe config categories" },
      { href: "/settings/health", label: "Health Operations", note: "health contract and blockers" },
      { href: "/settings/security", label: "Security Operations", note: "safety gates and secret boundaries" },
      { href: "/settings/validation", label: "Validation Operations", note: "local gate and repair signals" },
      { href: "/settings/contracts", label: "Contract Operations", note: "contract drift controls" },
      { href: "/settings/api", label: "API Operations", note: "route inventory and rate limits" }
    ]
  },
  {
    name: "Provider And Reporting",
    links: [
      { href: "/settings/provider", label: "Provider Details", note: "redacted local credential metadata" },
      { href: "/settings/numbers", label: "Provider Numbers", note: "local number metadata" },
      { href: "/settings/compliance", label: "Compliance Detail", note: "profile and hard-gate blockers" },
      { href: "/settings/readiness-audit", label: "Readiness Audit", note: "local readiness history" },
      { href: "/settings/exports", label: "Admin Exports", note: "bounded local CSV links" },
      { href: "/settings/reports", label: "Reporting Index", note: "reporting surface map" },
      { href: "/settings/usage", label: "Usage & Analytics", note: "tenant metrics and local usage" },
      { href: "/settings/billing", label: "Billing Operations", note: "local billing boundary" },
      { href: "/settings/ai", label: "AI Operations", note: "fake AI boundary and usage" },
      { href: "/settings/notifications", label: "Notification Operations", note: "no-send notification boundary" },
      { href: "/settings/integrations", label: "Integration Operations", note: "external-impact integrations" },
      { href: "/settings/team", label: "Team Operations", note: "membership metadata" },
      { href: "/settings/data", label: "Data Operations", note: "record totals and archive state" },
      { href: "/settings/runbook", label: "Operator Runbook", note: "local commands as read-only text" }
    ]
  }
] satisfies OperatorSurfaceGroup[];

export function getOperatorSurfaceSummary(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  const links = groups.flatMap((group) => group.links);

  return {
    groupCount: groups.length,
    surfaceCount: links.length,
    routes: links.map((link) => link.href)
  };
}

export function getRunbookAdminLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return groups.flatMap((group) => group.links).filter((link) => link.href === "/settings" || link.href.startsWith("/settings/"));
}

export function getSettingsNavigationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return getRunbookAdminLinks(groups).filter((link) => link.href !== "/settings");
}

export function getLaunchDashboardLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return groups.flatMap((group) => group.links);
}

export function getDemoConsoleLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return getLaunchDashboardLinks(groups).filter((link) => link.href !== "/demo");
}
