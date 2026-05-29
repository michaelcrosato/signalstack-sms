export type OperatorSurfaceLink = {
  readonly href: string;
  readonly label: string;
  readonly note: string;
};

export type OperatorSurfaceGroup = {
  readonly name: string;
  readonly links: readonly OperatorSurfaceLink[];
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
  getUniqueOperatorSurfaceLinks(groups);

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

function assertExactOperatorSurfaceFields(record: object, expectedKeys: readonly PropertyKey[], subject: string) {
  const actualKeys = Reflect.ownKeys(record);

  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !expectedKeys.includes(key))
  ) {
    throw new Error(`Invalid operator surface ${subject} fields`);
  }
}

function assertOperatorSurfaceLinkArray(links: readonly OperatorSurfaceLink[], groupName: string) {
  if (Object.getPrototypeOf(links) !== Array.prototype) {
    throw new Error(`Invalid operator surface link array prototype for group ${groupName}`);
  }

  const allowedKeys = new Set<PropertyKey>([
    "length",
    ...Array.from({ length: links.length }, (_, index) => String(index))
  ]);

  if (Reflect.ownKeys(links).some((key) => !allowedKeys.has(key))) {
    throw new Error(`Invalid operator surface link array fields for group ${groupName}`);
  }

  for (let index = 0; index < links.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(links, String(index));

    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`Invalid operator surface link array field descriptors for group ${groupName}`);
    }
  }
}

function assertOperatorSurfaceInventoryArray(groups: readonly OperatorSurfaceGroup[]) {
  if (Object.getPrototypeOf(groups) !== Array.prototype) {
    throw new Error("Invalid operator surface inventory array prototype");
  }

  const allowedKeys = new Set<PropertyKey>([
    "length",
    ...Array.from({ length: groups.length }, (_, index) => String(index))
  ]);

  if (Reflect.ownKeys(groups).some((key) => !allowedKeys.has(key))) {
    throw new Error("Invalid operator surface inventory array fields");
  }

  for (let index = 0; index < groups.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(groups, String(index));

    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error("Invalid operator surface inventory array field descriptors");
    }
  }
}

function assertOperatorSurfaceGroup(group: OperatorSurfaceGroup) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new Error("Invalid operator surface group");
  }

  if (Object.getPrototypeOf(group) !== Object.prototype) {
    throw new Error("Invalid operator surface group prototype");
  }

  if (!Object.hasOwn(group, "name") || !Object.hasOwn(group, "links")) {
    throw new Error("Invalid operator surface group fields");
  }

  assertExactOperatorSurfaceFields(group, ["name", "links"], "group");

  const nameDescriptor = Object.getOwnPropertyDescriptor(group, "name");
  const linksDescriptor = Object.getOwnPropertyDescriptor(group, "links");

  if (
    !nameDescriptor ||
    !("value" in nameDescriptor) ||
    !nameDescriptor.enumerable ||
    !linksDescriptor ||
    !("value" in linksDescriptor) ||
    !linksDescriptor.enumerable
  ) {
    throw new Error("Invalid operator surface group field descriptors");
  }
}

function assertOperatorSurfaceLink(link: OperatorSurfaceLink) {
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    throw new Error("Invalid operator surface link");
  }

  if (Object.getPrototypeOf(link) !== Object.prototype) {
    throw new Error("Invalid operator surface link prototype");
  }

  if (!Object.hasOwn(link, "href") || !Object.hasOwn(link, "label") || !Object.hasOwn(link, "note")) {
    throw new Error("Invalid operator surface link fields");
  }

  assertExactOperatorSurfaceFields(link, ["href", "label", "note"], "link");

  const hrefDescriptor = Object.getOwnPropertyDescriptor(link, "href");
  const labelDescriptor = Object.getOwnPropertyDescriptor(link, "label");
  const noteDescriptor = Object.getOwnPropertyDescriptor(link, "note");

  if (
    !hrefDescriptor ||
    !("value" in hrefDescriptor) ||
    !hrefDescriptor.enumerable ||
    !labelDescriptor ||
    !("value" in labelDescriptor) ||
    !labelDescriptor.enumerable ||
    !noteDescriptor ||
    !("value" in noteDescriptor) ||
    !noteDescriptor.enumerable
  ) {
    throw new Error("Invalid operator surface link field descriptors");
  }
}

function getUniqueOperatorSurfaceLinks(groups: readonly OperatorSurfaceGroup[]) {
  if (!Array.isArray(groups)) {
    throw new Error("Invalid operator surface inventory");
  }

  assertOperatorSurfaceInventoryArray(groups);

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

    assertOperatorSurfaceLinkArray(group.links, group.name);

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

// Consolidated to the release-safety + investor surfaces (ULTRAPLAN Phase A / A3). The page set is
// frozen by tests/unit/operations/settings-surface-allowlist.test.ts; the page<->inventory bijection is
// enforced by tests/unit/operations/operator-surfaces.test.ts.
export const operatorSurfaceGroups = freezeOperatorSurfaceGroups([
  {
    name: "Demo",
    links: [
      { href: "/demo", label: "Demo Console", note: "seeded investor path" }
    ]
  },
  {
    name: "Safety And Runtime",
    links: [
      { href: "/settings", label: "Go-Live Readiness", note: "provider and compliance blockers" },
      { href: "/settings/operations", label: "Operations Index", note: "grouped local operator surfaces" },
      { href: "/settings/health", label: "Health Operations", note: "health contract and blockers" },
      { href: "/settings/security", label: "Security Operations", note: "safety gates and secret boundaries" },
      { href: "/settings/validation", label: "Validation Operations", note: "local gate and repair signals" },
      { href: "/settings/queue", label: "Queue Operations", note: "scheduled job metadata" }
    ]
  },
  {
    name: "Provider And Compliance",
    links: [
      { href: "/settings/provider", label: "Provider Details", note: "redacted local credential metadata" },
      { href: "/settings/compliance", label: "Compliance Detail", note: "profile and hard-gate blockers" },
      { href: "/settings/readiness-audit", label: "Readiness Audit", note: "local readiness history" },
      { href: "/settings/exports", label: "Admin Exports", note: "bounded local CSV links" },
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

const securityOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/validation",
  "/settings/runbook"
] as const;

const healthOperationLinkRoutes = [
  "/settings/security",
  "/settings/validation"
] as const;

const validationOperationNavigationRoutes = [
  "/demo",
  "/settings",
  "/settings/runbook",
  "/settings/security"
] as const;

const queueOperationNavigationRoutes = [
  "/settings",
  "/settings/runbook"
] as const;

const exportOperationNavigationRoutes = [
  "/settings",
  "/settings/compliance",
  "/settings/readiness-audit",
  "/settings/runbook"
] as const;

const providerOperationNavigationRoutes = [
  "/settings",
  "/settings/compliance",
  "/settings/readiness-audit",
  "/settings/exports"
] as const;

const complianceOperationNavigationRoutes = [
  "/settings",
  "/settings/exports",
  "/settings/readiness-audit",
  "/settings/provider"
] as const;

const readinessAuditOperationNavigationRoutes = [
  "/settings",
  "/settings/exports",
  "/settings/compliance",
  "/settings/provider"
] as const;

export function getSecurityOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(securityOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getHealthOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(healthOperationLinkRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getValidationOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(validationOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getQueueOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(queueOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getExportOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(exportOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getProviderOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(providerOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getComplianceOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(complianceOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}

export function getReadinessAuditOperationLinks(groups: readonly OperatorSurfaceGroup[] = operatorSurfaceGroups) {
  return freezeProjectionArray(readinessAuditOperationNavigationRoutes.map((href) => findOperatorSurfaceLink(href, groups)));
}
