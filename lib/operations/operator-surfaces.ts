export type OperatorSurfaceLink = {
  readonly href: string;
  readonly label: string;
  readonly note: string;
};

export type OperatorSurfaceGroup = {
  readonly name: string;
  readonly links: readonly OperatorSurfaceLink[];
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

function freezeOperatorSurfaceLink(link: OperatorSurfaceLink) {
  return Object.freeze({
    href: link.href,
    label: link.label,
    note: link.note
  });
}

function freezeProjectionArray<T>(items: T[]) {
  return Object.freeze(items);
}

function freezeOperatorSurfaceGroups(groups: OperatorSurfaceGroup[]) {
  return Object.freeze(
    groups.map((group) =>
      Object.freeze({
        ...group,
        links: Object.freeze(group.links.map((link) => freezeOperatorSurfaceLink(link)))
      })
    )
  );
}

function assertNonBlankOperatorSurfaceField(fieldName: string, value: unknown) {
  if (typeof value !== "string") {
    throw new Error(`Invalid operator surface ${fieldName}`);
  }

  if (value.trim().length === 0) {
    throw new Error(`Blank operator surface ${fieldName}`);
  }
}

function assertOperatorSurfaceRouteShape(href: string) {
  const isCanonicalLocalRoute =
    href === "/demo" ||
    href === "/settings" ||
    (href.startsWith("/settings/") &&
      href === href.toLowerCase() &&
      !href.endsWith("/") &&
      !href.includes("?") &&
      !href.includes("#") &&
      !href.includes("[") &&
      !href.includes("]") &&
      !href.includes("//"));

  if (!isCanonicalLocalRoute) {
    throw new Error(`Invalid operator surface route shape ${href}`);
  }
}

function assertOperatorSurfaceGroup(group: OperatorSurfaceGroup) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new Error("Invalid operator surface group");
  }

  if (!Object.hasOwn(group, "name") || !Object.hasOwn(group, "links")) {
    throw new Error("Invalid operator surface group fields");
  }
}

function assertOperatorSurfaceLink(link: OperatorSurfaceLink) {
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    throw new Error("Invalid operator surface link");
  }

  if (!Object.hasOwn(link, "href") || !Object.hasOwn(link, "label") || !Object.hasOwn(link, "note")) {
    throw new Error("Invalid operator surface link fields");
  }
}

function getUniqueOperatorSurfaceLinks(groups: readonly OperatorSurfaceGroup[]) {
  if (!Array.isArray(groups)) {
    throw new Error("Invalid operator surface inventory");
  }

  if (groups.length === 0) {
    throw new Error("Empty operator surface inventory");
  }

  const seenGroupNames = new Set<string>();
  const seenRoutes = new Set<string>();
  const seenLabels = new Set<string>();
  const seenNotes = new Set<string>();

  for (const group of groups) {
    assertOperatorSurfaceGroup(group);
    assertNonBlankOperatorSurfaceField("group name", group.name);

    if (!Array.isArray(group.links)) {
      throw new Error(`Invalid operator surface links for group ${group.name}`);
    }

    if (group.links.length === 0) {
      throw new Error(`Empty operator surface group ${group.name}`);
    }

    if (seenGroupNames.has(group.name)) {
      throw new Error(`Duplicate operator surface group name ${group.name}`);
    }

    seenGroupNames.add(group.name);
  }

  const links: OperatorSurfaceLink[] = [];

  for (const group of groups) {
    for (const link of group.links) {
      assertOperatorSurfaceLink(link);
      links.push(link);
    }
  }

  for (const link of links) {
    assertNonBlankOperatorSurfaceField("route", link.href);
    assertNonBlankOperatorSurfaceField("label", link.label);
    assertNonBlankOperatorSurfaceField("note", link.note);
    assertOperatorSurfaceRouteShape(link.href);

    if (seenRoutes.has(link.href)) {
      throw new Error(`Duplicate operator surface route ${link.href}`);
    }

    if (seenLabels.has(link.label)) {
      throw new Error(`Duplicate operator surface label ${link.label}`);
    }

    if (seenNotes.has(link.note)) {
      throw new Error(`Duplicate operator surface note ${link.note}`);
    }

    seenRoutes.add(link.href);
    seenLabels.add(link.label);
    seenNotes.add(link.note);
  }

  return links;
}

export const operatorSurfaceGroups = freezeOperatorSurfaceGroups([
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
] satisfies OperatorSurfaceGroup[]);

export function getOperatorSurfaceSummary(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  const links = getUniqueOperatorSurfaceLinks(groups);

  return Object.freeze({
    groupCount: groups.length,
    surfaceCount: links.length,
    routes: freezeProjectionArray(links.map((link) => link.href))
  });
}

export function getRunbookAdminLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(
    getUniqueOperatorSurfaceLinks(groups)
      .filter((link) => link.href === "/settings" || link.href.startsWith("/settings/"))
      .map((link) => freezeOperatorSurfaceLink(link))
  );
}

export function getSettingsNavigationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(getRunbookAdminLinks(groups).filter((link) => link.href !== "/settings"));
}

export function getLaunchDashboardLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(getUniqueOperatorSurfaceLinks(groups).map((link) => freezeOperatorSurfaceLink(link)));
}

export function getDemoConsoleLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(getLaunchDashboardLinks(groups).filter((link) => link.href !== "/demo"));
}

function findOperatorSurfaceLink(href: string, groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  const link = getUniqueOperatorSurfaceLinks(groups).find((item) => item.href === href);

  if (!link) {
    throw new Error(`Missing operator surface link for ${href}`);
  }

  return freezeOperatorSurfaceLink(link);
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

const contactOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/campaigns",
  "/settings/data",
  "/settings/templates",
  "/settings/audience",
  "/settings/inbox",
  "/settings/usage"
] as const;

const campaignOperationNavigationRoutes = [
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
] as const;

const audienceOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/contacts",
  "/settings/templates",
  "/settings/campaigns"
] as const;

const templateOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/contacts",
  "/settings/audience",
  "/settings/campaigns",
  "/settings/inbox",
  "/settings/runbook"
] as const;

const inboxOperationNavigationRoutes = [
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
] as const;

const dataOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/contacts",
  "/settings/exports",
  "/settings/security",
  "/settings/runbook"
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

const billingOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/usage",
  "/settings/reports",
  "/settings/system",
  "/settings/runbook",
  "/settings/ai"
] as const;

const aiOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/usage",
  "/settings/billing",
  "/settings/runbook"
] as const;

const providerOperationNavigationRoutes = [
  "/settings",
  "/settings/integrations",
  "/settings/numbers",
  "/settings/compliance",
  "/settings/readiness-audit",
  "/settings/exports",
  "/settings/system"
] as const;

const numberOperationNavigationRoutes = [
  "/settings",
  "/settings/provider",
  "/settings/compliance",
  "/settings/system"
] as const;

const complianceOperationNavigationRoutes = [
  "/settings",
  "/settings/exports",
  "/settings/readiness-audit",
  "/settings/provider",
  "/settings/numbers",
  "/settings/system",
  "/settings/contacts",
  "/settings/templates",
  "/settings/audience"
] as const;

const systemOperationNavigationRoutes = [
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
] as const;

const usageOperationNavigationRoutes = [
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
] as const;

const readinessAuditOperationNavigationRoutes = [
  "/settings",
  "/settings/exports",
  "/settings/compliance",
  "/settings/provider"
] as const;

export function getDemoOperationsCheckpoints(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups): readonly DemoOperationsCheckpoint[] {
  return freezeProjectionArray(
    demoOperationsCheckpointDefinitions.map((checkpoint) => {
      const link = findOperatorSurfaceLink(checkpoint.href, groups);

      return Object.freeze({
        ...checkpoint,
        signal: link.label
      });
    })
  );
}

export function getDemoOperationsLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(demoOperationsLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getReportingIndexLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(reportingIndexRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getWorkflowOperationSteps(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups): readonly WorkflowOperationStep[] {
  return freezeProjectionArray(
    workflowOperationStepDefinitions.map((step) => {
      const link = findOperatorSurfaceLink(step.href, groups);

      return Object.freeze({
        ...step,
        owner: link.label
      });
    })
  );
}

export function getReleaseOperationSurfaceLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(releaseOperationSurfaceRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getIntegrationOperationAreas(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups): readonly IntegrationOperationArea[] {
  return freezeProjectionArray(
    integrationOperationAreaDefinitions.map((area) =>
      Object.freeze({
        ...findOperatorSurfaceLink(area.href, groups),
        state: area.state,
        boundary: area.boundary
      })
    )
  );
}

export function getSecurityOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(securityOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getEnvironmentOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(environmentOperationLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getHealthOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(healthOperationLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getContractOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(contractOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getValidationOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(validationOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getQueueOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(queueOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getContactOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(contactOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getCampaignOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(campaignOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getAudienceOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(audienceOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getTemplateOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(templateOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getInboxOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(inboxOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getDataOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(dataOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getNotificationOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(notificationOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getExportOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(exportOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getWebhookOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(webhookOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getDeliveryOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(deliveryOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getTeamOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(teamOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getBillingOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(billingOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getAiOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(aiOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getProviderOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(providerOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getNumberOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(numberOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getComplianceOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(complianceOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getSystemOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(systemOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getUsageOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(usageOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getReadinessAuditOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(readinessAuditOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}
