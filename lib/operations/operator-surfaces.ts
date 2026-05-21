export type OperatorSurfaceLink = {
  href: string;
  label: string;
  note: string;
};

export type OperatorSurfaceGroup = {
  name: string;
  links: OperatorSurfaceLink[];
};

export type DemoOperationsCheckpoint = {
  name: string;
  href: string;
  signal: string;
  boundary: string;
};

export type WorkflowOperationStep = {
  name: string;
  href: string;
  owner: string;
  boundary: string;
};

export type IntegrationOperationArea = OperatorSurfaceLink & {
  state: string;
  boundary: string;
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

function findOperatorSurfaceLink(href: string, groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  const link = groups.flatMap((group) => group.links).find((item) => item.href === href);

  if (!link) {
    throw new Error(`Missing operator surface link for ${href}`);
  }

  return link;
}

const demoOperationsCheckpointDefinitions = [
  {
    name: "Seeded workspace",
    href: "/demo",
    boundary: "Shows local seed records and demo-safe workflow steps without calling providers or sending messages."
  },
  {
    name: "Audience and consent",
    href: "/settings/contacts",
    boundary: "Reviews contact consent and import metadata without importing, mutating consent, or sending SMS."
  },
  {
    name: "Campaign readiness",
    href: "/settings/campaigns",
    boundary: "Reviews campaign and recipient state without scheduling, canceling, running workers, or sending."
  },
  {
    name: "Inbox replies",
    href: "/settings/inbox",
    boundary: "Reviews conversations and message metadata without creating replies, assigning threads, or mutating contacts."
  },
  {
    name: "Usage and reporting",
    href: "/settings/reports",
    boundary: "Reviews local analytics, usage, and export links without executing reports or creating exports."
  }
] as const;

const demoOperationsLinkRoutes = [
  "/settings/workflows",
  "/settings/operations",
  "/settings/releases",
  "/settings/environment"
] as const;

const reportingIndexRoutes = [
  "/settings/demo",
  "/settings/operations",
  "/settings/usage",
  "/settings/exports",
  "/settings/readiness-audit",
  "/settings/campaigns",
  "/settings/delivery",
  "/settings/workflows",
  "/settings/billing"
] as const;

const workflowOperationStepDefinitions = [
  {
    name: "Audience intake",
    href: "/settings/contacts",
    boundary: "CSV import and consent state remain local records; no labels, consent, or provider sends are changed here."
  },
  {
    name: "Campaign readiness",
    href: "/settings/campaigns",
    boundary: "Draft, preflight, and scheduled metadata are reviewed without scheduling, canceling, or sending messages."
  },
  {
    name: "Queue handoff",
    href: "/settings/queue",
    boundary: "Durable job state and worker limits are displayed without enqueueing, polling, Redis calls, or queue mutation."
  },
  {
    name: "Inbox response",
    href: "/settings/inbox",
    boundary: "Conversation and note metadata are visible without creating replies, assigning threads, or changing consent."
  },
  {
    name: "Delivery evidence",
    href: "/settings/delivery",
    boundary: "Existing message status metadata is reviewed without retries, webhook replay, provider calls, or SMS sends."
  },
  {
    name: "AI and reporting",
    href: "/settings/reports",
    boundary: "Fake AI, usage, analytics, and report links are summarized without prompts, exports, paid AI, or billing artifacts."
  }
] as const;

const releaseOperationSurfaceRoutes = [
  "/settings/demo",
  "/settings/validation",
  "/settings/contracts",
  "/settings/security",
  "/settings/system",
  "/settings/health",
  "/settings/runbook",
  "/settings/workflows"
] as const;

const integrationOperationAreaDefinitions = [
  {
    href: "/settings/provider",
    state: "dummy-first",
    boundary: "Provider metadata stays local and redacted; no Twilio verification, provisioning, revocation, or sends run here."
  },
  {
    href: "/settings/numbers",
    state: "metadata only",
    boundary: "Phone-number rows are local readiness records, not proof of provider ownership or send approval."
  },
  {
    href: "/settings/webhooks",
    state: "inbound only",
    boundary: "Webhook routes persist inbound/status events locally and do not emit replies or provider mutations."
  },
  {
    href: "/settings/ai",
    state: "fake provider",
    boundary: "AI endpoints use deterministic fake output; this view does not submit prompts or call paid models."
  },
  {
    href: "/settings/billing",
    state: "local ledger",
    boundary: "Usage and billing records are local metadata; no Stripe customers, invoices, subscriptions, or charges are created."
  },
  {
    href: "/settings/notifications",
    state: "no-send",
    boundary: "Email, SMS alerts, browser push, and outbound webhooks remain blocked until future hard gates exist."
  }
] as const;

const securityOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/system",
  "/settings/api",
  "/settings/contracts",
  "/settings/notifications",
  "/settings/validation",
  "/settings/runbook",
  "/settings/releases"
] as const;

const environmentOperationLinkRoutes = [
  "/settings/system",
  "/settings/health",
  "/settings/security",
  "/settings/validation",
  "/settings/releases"
] as const;

const healthOperationLinkRoutes = [
  "/settings/system",
  "/settings/api",
  "/settings/security",
  "/settings/validation"
] as const;

const contractOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/api",
  "/settings/security",
  "/settings/runbook",
  "/settings/validation"
] as const;

const validationOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/contracts",
  "/settings/runbook",
  "/settings/security",
  "/settings/releases"
] as const;

const queueOperationNavigationRoutes = [
  "/settings",
  "/settings/campaigns",
  "/settings/system",
  "/settings/runbook",
  "/settings/workflows",
  "/settings/releases"
] as const;

const notificationOperationNavigationRoutes = [
  "/settings",
  "/settings/security",
  "/settings/system",
  "/settings/integrations",
  "/settings/runbook",
  "/settings/releases"
] as const;

const exportOperationNavigationRoutes = [
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
] as const;

const webhookOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/system",
  "/settings/inbox",
  "/settings/delivery",
  "/settings/runbook"
] as const;

const deliveryOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/campaigns",
  "/settings/queue",
  "/settings/inbox",
  "/settings/webhooks"
] as const;

const teamOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/campaigns",
  "/settings/contacts",
  "/settings/inbox",
  "/settings/system",
  "/settings/runbook"
] as const;

export function getDemoOperationsCheckpoints(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups): DemoOperationsCheckpoint[] {
  return demoOperationsCheckpointDefinitions.map((checkpoint) => {
    const link = findOperatorSurfaceLink(checkpoint.href, groups);

    return {
      ...checkpoint,
      signal: link.label
    };
  });
}

export function getDemoOperationsLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return demoOperationsLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getReportingIndexLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return reportingIndexRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getWorkflowOperationSteps(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups): WorkflowOperationStep[] {
  return workflowOperationStepDefinitions.map((step) => {
    const link = findOperatorSurfaceLink(step.href, groups);

    return {
      ...step,
      owner: link.label
    };
  });
}

export function getReleaseOperationSurfaceLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return releaseOperationSurfaceRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getIntegrationOperationAreas(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups): IntegrationOperationArea[] {
  return integrationOperationAreaDefinitions.map((area) => ({
    ...findOperatorSurfaceLink(area.href, groups),
    state: area.state,
    boundary: area.boundary
  }));
}

export function getSecurityOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return securityOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getEnvironmentOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return environmentOperationLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getHealthOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return healthOperationLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getContractOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return contractOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getValidationOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return validationOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getQueueOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return queueOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getNotificationOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return notificationOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getExportOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return exportOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getWebhookOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return webhookOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getDeliveryOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return deliveryOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}

export function getTeamOperationLinks(groups: OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return teamOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups));
}
