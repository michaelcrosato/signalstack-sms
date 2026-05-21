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
  operatorSurfaceGroups,
  type OperatorSurfaceLink,
  type OperatorSurfaceGroup
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

function withCustomSurfaceCopy(
  groups: readonly OperatorSurfaceGroup[],
  href: string,
  copy: { label: string; note: string }
): OperatorSurfaceGroup[] {
  return groups.map((group) => ({
    ...group,
    links: group.links.map((link) => (link.href === href ? { ...link, ...copy } : link))
  }));
}

function withRouteStampedSurfaceCopy(groups: readonly OperatorSurfaceGroup[]): OperatorSurfaceGroup[] {
  let linkIndex = 0;

  return groups.map((group, groupIndex) => ({
    name: `Custom Group ${groupIndex + 1}`,
    links: group.links.map((link) => {
      linkIndex += 1;

      return {
        ...link,
        label: `Custom Link ${linkIndex}`,
        note: `custom note ${linkIndex}`
      };
    })
  }));
}

function cloneSurfaceGroups(groups: readonly OperatorSurfaceGroup[]): OperatorSurfaceGroup[] {
  return groups.map((group) => ({
    ...group,
    links: group.links.map((link) => ({ ...link }))
  }));
}

function withoutSurfaceRoute(groups: readonly OperatorSurfaceGroup[], href: string): OperatorSurfaceGroup[] {
  return groups.map((group) => ({
    ...group,
    links: group.links.filter((link) => link.href !== href)
  }));
}

describe("operator surface inventory", () => {
  it("keeps the operations index grouped around the current local-only surfaces", () => {
    const summary = getOperatorSurfaceSummary();
    const exportedRoutes = operatorSurfaceGroups.flatMap((group) => group.links.map((link) => link.href));

    expect(summary.groupCount).toBe(4);
    expect(summary.surfaceCount).toBe(35);
    expect(summary.routes).toEqual(exportedRoutes);
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

  it("keeps the canonical shared inventory frozen against runtime mutation", () => {
    const firstGroup = operatorSurfaceGroups[0];
    const firstLink = firstGroup.links[0];

    expect(Object.isFrozen(operatorSurfaceGroups)).toBe(true);
    expect(operatorSurfaceGroups.every((group) => Object.isFrozen(group) && Object.isFrozen(group.links))).toBe(true);
    expect(operatorSurfaceGroups.flatMap((group) => group.links).every((link) => Object.isFrozen(link))).toBe(true);
    expect(() =>
      (operatorSurfaceGroups as unknown as OperatorSurfaceGroup[]).push({
        name: "Unsafe Mutation",
        links: []
      })
    ).toThrow(TypeError);
    expect(() => (firstGroup.links as unknown as OperatorSurfaceGroup[]).pop()).toThrow(TypeError);
    expect(() => ((firstLink as unknown as { label: string }).label = "Unsafe Mutation")).toThrow(TypeError);
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

  it("keeps operator surface copy aligned with route names", () => {
    const links = operatorSurfaceGroups.flatMap((group) => group.links);
    const expectedCopyTermsByRoute = new Map([
      ["/demo", ["demo"]],
      ["/settings", ["go-live", "readiness"]]
    ]);

    const copyDrift = links.filter((link) => {
      const routeTerms =
        expectedCopyTermsByRoute.get(link.href) ??
        link.href
          .split("/")
          .filter(Boolean)
          .at(-1)
          ?.split("-")
          .flatMap((term) => (term.endsWith("s") ? [term, term.slice(0, -1)] : [term])) ??
        [];
      const searchableCopy = `${link.label} ${link.note}`.toLowerCase();

      return !routeTerms.some((term) => searchableCopy.includes(term));
    });

    expect(copyDrift).toEqual([]);
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

  it("rejects supplied operator inventories with duplicate routes before projection", () => {
    const duplicateRoute = operatorSurfaceGroups[0].links[0].href;
    const groups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: duplicateRoute }, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groups)).toThrow(`Duplicate operator surface route ${duplicateRoute}`);
    expect(() => getLaunchDashboardLinks(groups)).toThrow(`Duplicate operator surface route ${duplicateRoute}`);
    expect(() => getDemoOperationsLinks(groups)).toThrow(`Duplicate operator surface route ${duplicateRoute}`);
  });

  it("rejects supplied operator inventories with empty groups before projection", () => {
    const emptyGroupName = operatorSurfaceGroups[1].name;
    const groups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? [] : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groups)).toThrow(`Empty operator surface group ${emptyGroupName}`);
    expect(() => getLaunchDashboardLinks(groups)).toThrow(`Empty operator surface group ${emptyGroupName}`);
    expect(() => getDemoOperationsLinks(groups)).toThrow(`Empty operator surface group ${emptyGroupName}`);
  });

  it("rejects empty supplied operator inventories before projection", () => {
    const groups: OperatorSurfaceGroup[] = [];

    expect(() => getOperatorSurfaceSummary(groups)).toThrow("Empty operator surface inventory");
    expect(() => getLaunchDashboardLinks(groups)).toThrow("Empty operator surface inventory");
    expect(() => getDemoOperationsLinks(groups)).toThrow("Empty operator surface inventory");
  });

  it("rejects supplied operator inventories that are not arrays before projection", () => {
    const groupsAsObject = { groups: cloneSurfaceGroups(operatorSurfaceGroups) } as unknown as OperatorSurfaceGroup[];
    const groupsAsNull = null as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(groupsAsObject)).toThrow("Invalid operator surface inventory");
    expect(() => getLaunchDashboardLinks(groupsAsObject)).toThrow("Invalid operator surface inventory");
    expect(() => getDemoOperationsLinks(groupsAsNull)).toThrow("Invalid operator surface inventory");
  });

  it("rejects supplied operator inventories with non-plain inventory arrays before projection", () => {
    const symbolKey = Symbol("unsafe");
    const groupsWithExtraStringField = cloneSurfaceGroups(operatorSurfaceGroups);
    const groupsWithExtraSymbolField = cloneSurfaceGroups(operatorSurfaceGroups);
    class CustomInventoryArray extends Array<OperatorSurfaceGroup> {}

    (groupsWithExtraStringField as unknown as Record<string, string>).internalOwner = "unsafe-owner";
    (groupsWithExtraSymbolField as unknown as Record<PropertyKey, string>)[symbolKey] = "unsafe-symbol";
    const customPrototypeGroups = new CustomInventoryArray(...cloneSurfaceGroups(operatorSurfaceGroups));

    expect(() => getOperatorSurfaceSummary(groupsWithExtraStringField)).toThrow(
      "Invalid operator surface inventory array fields"
    );
    expect(() => getLaunchDashboardLinks(groupsWithExtraSymbolField)).toThrow(
      "Invalid operator surface inventory array fields"
    );
    expect(() => getDemoOperationsLinks(customPrototypeGroups)).toThrow(
      "Invalid operator surface inventory array prototype"
    );
  });

  it("rejects supplied operator inventories with unsafe or missing inventory array index descriptors before projection", () => {
    let getterWasRead = false;
    const groupsWithAccessorIndex = cloneSurfaceGroups(operatorSurfaceGroups);
    Object.defineProperty(groupsWithAccessorIndex, "1", {
      enumerable: true,
      get: () => {
        getterWasRead = true;
        return operatorSurfaceGroups[1];
      }
    });

    const groupsWithHiddenIndex = cloneSurfaceGroups(operatorSurfaceGroups);
    Object.defineProperty(groupsWithHiddenIndex, "1", {
      value: operatorSurfaceGroups[1],
      enumerable: false
    });

    const groupsWithMissingIndex = cloneSurfaceGroups(operatorSurfaceGroups);
    delete groupsWithMissingIndex[1];

    expect(() => getOperatorSurfaceSummary(groupsWithAccessorIndex)).toThrow(
      "Invalid operator surface inventory array field descriptors"
    );
    expect(getterWasRead).toBe(false);
    expect(() => getLaunchDashboardLinks(groupsWithHiddenIndex)).toThrow(
      "Invalid operator surface inventory array field descriptors"
    );
    expect(() => getDemoOperationsLinks(groupsWithMissingIndex)).toThrow(
      "Invalid operator surface inventory array field descriptors"
    );
  });

  it("rejects supplied operator inventories with invalid group link arrays before projection", () => {
    const invalidGroupName = operatorSurfaceGroups[1].name;
    const groups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? undefined : group.links
    })) as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(groups)).toThrow(`Invalid operator surface links for group ${invalidGroupName}`);
    expect(() => getLaunchDashboardLinks(groups)).toThrow(`Invalid operator surface links for group ${invalidGroupName}`);
    expect(() => getDemoOperationsLinks(groups)).toThrow(`Invalid operator surface links for group ${invalidGroupName}`);
  });

  it("rejects supplied operator inventories with invalid group objects before projection", () => {
    const groupsWithNull = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? null : group
    ) as unknown as OperatorSurfaceGroup[];
    const groupsWithArray = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? [] : group
    ) as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(groupsWithNull)).toThrow("Invalid operator surface group");
    expect(() => getLaunchDashboardLinks(groupsWithNull)).toThrow("Invalid operator surface group");
    expect(() => getDemoOperationsLinks(groupsWithArray)).toThrow("Invalid operator surface group");
  });

  it("rejects supplied operator inventories with sparse group entries before projection", () => {
    const sparseGroups = cloneSurfaceGroups(operatorSurfaceGroups);
    delete sparseGroups[1];
    const groups = sparseGroups as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(groups)).toThrow(
      "Invalid operator surface inventory array field descriptors"
    );
    expect(() => getLaunchDashboardLinks(groups)).toThrow(
      "Invalid operator surface inventory array field descriptors"
    );
    expect(() => getDemoOperationsLinks(groups)).toThrow(
      "Invalid operator surface inventory array field descriptors"
    );
  });

  it("rejects supplied operator inventories with invalid link objects before projection", () => {
    const groupsWithNullLink = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [null, ...group.links.slice(1)]
          : group.links
    })) as unknown as OperatorSurfaceGroup[];
    const groupsWithArrayLink = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [[], ...group.links.slice(1)]
          : group.links
    })) as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(groupsWithNullLink)).toThrow("Invalid operator surface link");
    expect(() => getLaunchDashboardLinks(groupsWithNullLink)).toThrow("Invalid operator surface link");
    expect(() => getDemoOperationsLinks(groupsWithArrayLink)).toThrow("Invalid operator surface link");
  });

  it("rejects supplied operator inventories with prototype-backed fields before projection", () => {
    const prototypeBackedGroup = Object.create({
      name: "Prototype Group",
      links: operatorSurfaceGroups[1].links
    }) as OperatorSurfaceGroup;
    const groupsWithPrototypeBackedGroup = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? prototypeBackedGroup : group
    );

    const prototypeBackedLink = Object.create(operatorSurfaceGroups[1].links[0]) as OperatorSurfaceLink;
    const groupsWithPrototypeBackedLink = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [prototypeBackedLink, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithPrototypeBackedGroup)).toThrow(
      "Invalid operator surface group prototype"
    );
    expect(() => getLaunchDashboardLinks(groupsWithPrototypeBackedGroup)).toThrow(
      "Invalid operator surface group prototype"
    );
    expect(() => getSettingsNavigationLinks(groupsWithPrototypeBackedLink)).toThrow(
      "Invalid operator surface link prototype"
    );
    expect(() => getDemoOperationsLinks(groupsWithPrototypeBackedLink)).toThrow(
      "Invalid operator surface link prototype"
    );
  });

  it("rejects supplied operator inventories with custom-prototype records before projection", () => {
    const customPrototypeGroup = Object.assign(Object.create({ kind: "custom-group" }), {
      name: "Custom Prototype Group",
      links: operatorSurfaceGroups[1].links
    }) as OperatorSurfaceGroup;
    const groupsWithCustomPrototypeGroup = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? customPrototypeGroup : group
    );

    const customPrototypeLink = Object.assign(Object.create({ kind: "custom-link" }), {
      href: operatorSurfaceGroups[1].links[0].href,
      label: operatorSurfaceGroups[1].links[0].label,
      note: operatorSurfaceGroups[1].links[0].note
    }) as OperatorSurfaceLink;
    const groupsWithCustomPrototypeLink = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [customPrototypeLink, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithCustomPrototypeGroup)).toThrow(
      "Invalid operator surface group prototype"
    );
    expect(() => getLaunchDashboardLinks(groupsWithCustomPrototypeGroup)).toThrow(
      "Invalid operator surface group prototype"
    );
    expect(() => getSettingsNavigationLinks(groupsWithCustomPrototypeLink)).toThrow(
      "Invalid operator surface link prototype"
    );
    expect(() => getDemoOperationsLinks(groupsWithCustomPrototypeLink)).toThrow(
      "Invalid operator surface link prototype"
    );
  });

  it("rejects supplied operator inventories with accessor-backed fields before projection", () => {
    const accessorBackedGroup = {} as OperatorSurfaceGroup;
    Object.defineProperty(accessorBackedGroup, "name", {
      get: () => "Accessor Group"
    });
    Object.defineProperty(accessorBackedGroup, "links", {
      value: operatorSurfaceGroups[1].links
    });
    const groupsWithAccessorBackedGroup = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? accessorBackedGroup : group
    );

    const accessorBackedLink = {} as OperatorSurfaceLink;
    Object.defineProperty(accessorBackedLink, "href", {
      value: operatorSurfaceGroups[1].links[0].href
    });
    Object.defineProperty(accessorBackedLink, "label", {
      get: () => operatorSurfaceGroups[1].links[0].label
    });
    Object.defineProperty(accessorBackedLink, "note", {
      value: operatorSurfaceGroups[1].links[0].note
    });
    const groupsWithAccessorBackedLink = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [accessorBackedLink, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithAccessorBackedGroup)).toThrow(
      "Invalid operator surface group field descriptors"
    );
    expect(() => getLaunchDashboardLinks(groupsWithAccessorBackedGroup)).toThrow(
      "Invalid operator surface group field descriptors"
    );
    expect(() => getSettingsNavigationLinks(groupsWithAccessorBackedLink)).toThrow(
      "Invalid operator surface link field descriptors"
    );
    expect(() => getDemoOperationsLinks(groupsWithAccessorBackedLink)).toThrow(
      "Invalid operator surface link field descriptors"
    );
  });

  it("rejects supplied operator inventories with non-enumerable fields before projection", () => {
    const hiddenFieldGroup = {} as OperatorSurfaceGroup;
    Object.defineProperty(hiddenFieldGroup, "name", {
      value: "Hidden Field Group",
      enumerable: false
    });
    Object.defineProperty(hiddenFieldGroup, "links", {
      value: operatorSurfaceGroups[1].links,
      enumerable: true
    });
    const groupsWithHiddenFieldGroup = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? hiddenFieldGroup : group
    );

    const hiddenFieldLink = {} as OperatorSurfaceLink;
    Object.defineProperty(hiddenFieldLink, "href", {
      value: operatorSurfaceGroups[1].links[0].href,
      enumerable: true
    });
    Object.defineProperty(hiddenFieldLink, "label", {
      value: operatorSurfaceGroups[1].links[0].label,
      enumerable: false
    });
    Object.defineProperty(hiddenFieldLink, "note", {
      value: operatorSurfaceGroups[1].links[0].note,
      enumerable: true
    });
    const groupsWithHiddenFieldLink = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [hiddenFieldLink, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithHiddenFieldGroup)).toThrow(
      "Invalid operator surface group field descriptors"
    );
    expect(() => getLaunchDashboardLinks(groupsWithHiddenFieldGroup)).toThrow(
      "Invalid operator surface group field descriptors"
    );
    expect(() => getSettingsNavigationLinks(groupsWithHiddenFieldLink)).toThrow(
      "Invalid operator surface link field descriptors"
    );
    expect(() => getDemoOperationsLinks(groupsWithHiddenFieldLink)).toThrow(
      "Invalid operator surface link field descriptors"
    );
  });

  it("rejects supplied operator inventories with extra fields before projection", () => {
    const symbolKey = Symbol("unsafe");
    const groupWithExtraStringField = {
      ...operatorSurfaceGroups[1],
      internalOwner: "unsafe-owner"
    } as unknown as OperatorSurfaceGroup;
    const groupWithExtraSymbolField = {
      ...operatorSurfaceGroups[1],
      [symbolKey]: "unsafe-symbol"
    } as unknown as OperatorSurfaceGroup;
    const groupsWithExtraStringField = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? groupWithExtraStringField : group
    );
    const groupsWithExtraSymbolField = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) =>
      groupIndex === 1 ? groupWithExtraSymbolField : group
    );

    const linkWithExtraStringField = {
      ...operatorSurfaceGroups[1].links[0],
      secretToken: "unsafe-token"
    } as unknown as OperatorSurfaceLink;
    const linkWithExtraSymbolField = {
      ...operatorSurfaceGroups[1].links[0],
      [symbolKey]: "unsafe-symbol"
    } as unknown as OperatorSurfaceLink;
    const groupsWithExtraStringLinkField = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [linkWithExtraStringField, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithExtraSymbolLinkField = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [linkWithExtraSymbolField, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithExtraStringField)).toThrow("Invalid operator surface group fields");
    expect(() => getLaunchDashboardLinks(groupsWithExtraSymbolField)).toThrow("Invalid operator surface group fields");
    expect(() => getSettingsNavigationLinks(groupsWithExtraStringLinkField)).toThrow("Invalid operator surface link fields");
    expect(() => getDemoOperationsLinks(groupsWithExtraSymbolLinkField)).toThrow("Invalid operator surface link fields");
  });

  it("rejects supplied operator inventories with non-plain link arrays before projection", () => {
    const symbolKey = Symbol("unsafe");
    const linkArrayWithExtraStringField = [...operatorSurfaceGroups[1].links];
    const linkArrayWithExtraSymbolField = [...operatorSurfaceGroups[1].links];
    class CustomLinkArray extends Array<OperatorSurfaceLink> {}

    (linkArrayWithExtraStringField as unknown as Record<string, string>).internalOwner = "unsafe-owner";
    (linkArrayWithExtraSymbolField as unknown as Record<PropertyKey, string>)[symbolKey] = "unsafe-symbol";
    const customPrototypeLinks = new CustomLinkArray(...operatorSurfaceGroups[1].links);

    const groupsWithExtraStringLinkArrayField = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? linkArrayWithExtraStringField : group.links
    }));
    const groupsWithExtraSymbolLinkArrayField = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? linkArrayWithExtraSymbolField : group.links
    }));
    const groupsWithCustomPrototypeLinkArray = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? customPrototypeLinks : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithExtraStringLinkArrayField)).toThrow(
      `Invalid operator surface link array fields for group ${operatorSurfaceGroups[1].name}`
    );
    expect(() => getLaunchDashboardLinks(groupsWithExtraSymbolLinkArrayField)).toThrow(
      `Invalid operator surface link array fields for group ${operatorSurfaceGroups[1].name}`
    );
    expect(() => getDemoOperationsLinks(groupsWithCustomPrototypeLinkArray)).toThrow(
      `Invalid operator surface link array prototype for group ${operatorSurfaceGroups[1].name}`
    );
  });

  it("rejects supplied operator inventories with unsafe link array index descriptors before projection", () => {
    let getterWasRead = false;
    const linkArrayWithAccessorIndex = [...operatorSurfaceGroups[1].links];
    Object.defineProperty(linkArrayWithAccessorIndex, "0", {
      enumerable: true,
      get: () => {
        getterWasRead = true;
        return operatorSurfaceGroups[1].links[0];
      }
    });

    const linkArrayWithHiddenIndex = [...operatorSurfaceGroups[1].links];
    Object.defineProperty(linkArrayWithHiddenIndex, "0", {
      value: operatorSurfaceGroups[1].links[0],
      enumerable: false
    });

    const groupsWithAccessorIndex = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? linkArrayWithAccessorIndex : group.links
    }));
    const groupsWithHiddenIndex = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? linkArrayWithHiddenIndex : group.links
    }));

    expect(() => getSettingsNavigationLinks(groupsWithAccessorIndex)).toThrow(
      `Invalid operator surface link array field descriptors for group ${operatorSurfaceGroups[1].name}`
    );
    expect(getterWasRead).toBe(false);
    expect(() => getDemoOperationsLinks(groupsWithHiddenIndex)).toThrow(
      `Invalid operator surface link array field descriptors for group ${operatorSurfaceGroups[1].name}`
    );
  });

  it("rejects supplied operator inventories with sparse link entries before projection", () => {
    const sparseLinks = [...operatorSurfaceGroups[1].links];
    delete sparseLinks[0];
    const groups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links: groupIndex === 1 ? sparseLinks : group.links
    })) as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(groups)).toThrow(
      `Invalid operator surface link array field descriptors for group ${operatorSurfaceGroups[1].name}`
    );
    expect(() => getLaunchDashboardLinks(groups)).toThrow(
      `Invalid operator surface link array field descriptors for group ${operatorSurfaceGroups[1].name}`
    );
    expect(() => getDemoOperationsLinks(groups)).toThrow(
      `Invalid operator surface link array field descriptors for group ${operatorSurfaceGroups[1].name}`
    );
  });

  it("rejects supplied operator inventories with ambiguous copy before projection", () => {
    const duplicateGroupName = operatorSurfaceGroups[0].name;
    const duplicateLabel = operatorSurfaceGroups[0].links[0].label;
    const duplicateNote = operatorSurfaceGroups[0].links[0].note;
    const duplicateGroupNameGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      name: groupIndex === 1 ? duplicateGroupName : group.name
    }));
    const duplicateLabelGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], label: duplicateLabel }, ...group.links.slice(1)]
          : group.links
    }));
    const duplicateNoteGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], note: duplicateNote }, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(duplicateGroupNameGroups)).toThrow(
      `Duplicate operator surface group name ${duplicateGroupName}`
    );
    expect(() => getLaunchDashboardLinks(duplicateLabelGroups)).toThrow(`Duplicate operator surface label ${duplicateLabel}`);
    expect(() => getDemoOperationsLinks(duplicateNoteGroups)).toThrow(`Duplicate operator surface note ${duplicateNote}`);
  });

  it("rejects supplied operator inventories with blank copy before projection", () => {
    const blankGroupNameGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      name: groupIndex === 1 ? "   " : group.name
    }));
    const blankRouteGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "   " }, ...group.links.slice(1)]
          : group.links
    }));
    const blankLabelGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], label: "   " }, ...group.links.slice(1)]
          : group.links
    }));
    const blankNoteGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], note: "   " }, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(blankGroupNameGroups)).toThrow("Blank operator surface group name");
    expect(() => getLaunchDashboardLinks(blankRouteGroups)).toThrow("Blank operator surface route");
    expect(() => getSettingsNavigationLinks(blankLabelGroups)).toThrow("Blank operator surface label");
    expect(() => getDemoOperationsLinks(blankNoteGroups)).toThrow("Blank operator surface note");
  });

  it("rejects supplied operator inventories with non-string fields before projection", () => {
    const invalidGroupNameGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      name: groupIndex === 1 ? 123 : group.name
    })) as unknown as OperatorSurfaceGroup[];
    const invalidRouteGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: false }, ...group.links.slice(1)]
          : group.links
    })) as unknown as OperatorSurfaceGroup[];
    const invalidLabelGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], label: 123 }, ...group.links.slice(1)]
          : group.links
    })) as unknown as OperatorSurfaceGroup[];
    const invalidNoteGroups = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], note: null }, ...group.links.slice(1)]
          : group.links
    })) as unknown as OperatorSurfaceGroup[];

    expect(() => getOperatorSurfaceSummary(invalidGroupNameGroups)).toThrow("Invalid operator surface group name");
    expect(() => getLaunchDashboardLinks(invalidRouteGroups)).toThrow("Invalid operator surface route");
    expect(() => getSettingsNavigationLinks(invalidLabelGroups)).toThrow("Invalid operator surface label");
    expect(() => getDemoOperationsLinks(invalidNoteGroups)).toThrow("Invalid operator surface note");
  });

  it("rejects supplied operator inventories with invalid route shapes before projection", () => {
    const groupsWithApiRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/api/unsafe" }, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithUppercaseRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/settings/Unsafe" }, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithDynamicRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/settings/[unsafe]" }, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithQueryRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/settings/provider?unsafe=true" }, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithHashRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/settings/provider#unsafe" }, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithTrailingSlashRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/settings/provider/" }, ...group.links.slice(1)]
          : group.links
    }));
    const groupsWithDoubleSlashRoute = cloneSurfaceGroups(operatorSurfaceGroups).map((group, groupIndex) => ({
      ...group,
      links:
        groupIndex === 1
          ? [{ ...group.links[0], href: "/settings//provider" }, ...group.links.slice(1)]
          : group.links
    }));

    expect(() => getOperatorSurfaceSummary(groupsWithApiRoute)).toThrow("Invalid operator surface route shape /api/unsafe");
    expect(() => getLaunchDashboardLinks(groupsWithUppercaseRoute)).toThrow("Invalid operator surface route shape /settings/Unsafe");
    expect(() => getSettingsNavigationLinks(groupsWithDynamicRoute)).toThrow("Invalid operator surface route shape /settings/[unsafe]");
    expect(() => getDemoOperationsLinks(groupsWithQueryRoute)).toThrow(
      "Invalid operator surface route shape /settings/provider?unsafe=true"
    );
    expect(() => getRunbookAdminLinks(groupsWithHashRoute)).toThrow("Invalid operator surface route shape /settings/provider#unsafe");
    expect(() => getDemoConsoleLinks(groupsWithTrailingSlashRoute)).toThrow(
      "Invalid operator surface route shape /settings/provider/"
    );
    expect(() => getDemoOperationsCheckpoints(groupsWithDoubleSlashRoute)).toThrow(
      "Invalid operator surface route shape /settings//provider"
    );
  });

  it("keeps inventory copy whitespace-clean for projected navigation", () => {
    const copyFields = operatorSurfaceGroups.flatMap((group) => [
      group.name,
      ...group.links.flatMap((link) => [link.href, link.label, link.note])
    ]);

    expect(copyFields.filter((value) => value.trim() !== value)).toEqual([]);
    expect(copyFields.filter((value) => value.includes("  "))).toEqual([]);
    expect(copyFields.filter((value) => value.includes("\n"))).toEqual([]);
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

  it("keeps operator inventory copy concise and scannable", () => {
    const links = operatorSurfaceGroups.flatMap((group) => group.links);
    const allowedLabelSuffix = /(Console|Operations|Readiness|Index|Status|Details|Numbers|Detail|Audit|Exports|Analytics|Runbook)$/;

    expect(operatorSurfaceGroups.map((group) => group.name).filter((name) => name.length > 32)).toEqual([]);
    expect(links.map((link) => link.label).filter((label) => label.length > 32)).toEqual([]);
    expect(links.map((link) => link.note).filter((note) => note.length > 40)).toEqual([]);
    expect(links.map((link) => link.label).filter((label) => !allowedLabelSuffix.test(label))).toEqual([]);
  });

  it("keeps shared operator navigation copy action-neutral", () => {
    const forbiddenActionWords =
      /\b((?<!no-)send|sending|sent|create|creating|delete|deleting|run|running|execute|executing|schedule|scheduling|provision|provisioning|charge|charging|invite|inviting|enable|enabling|configure|configuring|verify|verifying|replay|replaying|retry|retrying|submit|submitting|mutate|mutating)\b/i;
    const copyFields = operatorSurfaceGroups.flatMap((group) => [
      { route: group.name, copy: group.name },
      ...group.links.flatMap((link) => [
        { route: link.href, copy: link.label },
        { route: link.href, copy: link.note }
      ])
    ]);
    const actionCopy = copyFields.filter((field) => forbiddenActionWords.test(field.copy));

    expect(actionCopy).toEqual([]);
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

  it("keeps every operator surface reachable from focused projections", () => {
    const inventoryRoutes = operatorSurfaceGroups.flatMap((group) => group.links.map((link) => link.href));
    const focusedProjectedRoutes = [
      ...getDemoOperationsLinks().map((link) => link.href),
      ...getReportingIndexLinks().map((link) => link.href),
      ...getReleaseOperationSurfaceLinks().map((link) => link.href),
      ...getSecurityOperationLinks().map((link) => link.href),
      ...getEnvironmentOperationLinks().map((link) => link.href),
      ...getHealthOperationLinks().map((link) => link.href),
      ...getContractOperationLinks().map((link) => link.href),
      ...getValidationOperationLinks().map((link) => link.href),
      ...getQueueOperationLinks().map((link) => link.href),
      ...getContactOperationLinks().map((link) => link.href),
      ...getCampaignOperationLinks().map((link) => link.href),
      ...getAudienceOperationLinks().map((link) => link.href),
      ...getTemplateOperationLinks().map((link) => link.href),
      ...getInboxOperationLinks().map((link) => link.href),
      ...getDataOperationLinks().map((link) => link.href),
      ...getNotificationOperationLinks().map((link) => link.href),
      ...getExportOperationLinks().map((link) => link.href),
      ...getWebhookOperationLinks().map((link) => link.href),
      ...getDeliveryOperationLinks().map((link) => link.href),
      ...getTeamOperationLinks().map((link) => link.href),
      ...getBillingOperationLinks().map((link) => link.href),
      ...getAiOperationLinks().map((link) => link.href),
      ...getProviderOperationLinks().map((link) => link.href),
      ...getNumberOperationLinks().map((link) => link.href),
      ...getComplianceOperationLinks().map((link) => link.href),
      ...getSystemOperationLinks().map((link) => link.href),
      ...getUsageOperationLinks().map((link) => link.href),
      ...getReadinessAuditOperationLinks().map((link) => link.href),
      ...getDemoOperationsCheckpoints().map((checkpoint) => checkpoint.href),
      ...getWorkflowOperationSteps().map((step) => step.href),
      ...getIntegrationOperationAreas().map((area) => area.href)
    ];
    const focusedProjectedRouteSet = new Set(focusedProjectedRoutes);

    expect(inventoryRoutes.filter((route) => !focusedProjectedRouteSet.has(route))).toEqual([]);
  });

  it("fails loudly when a projection references a missing shared inventory route", () => {
    expect(() => getReportingIndexLinks(withoutSurfaceRoute(operatorSurfaceGroups, "/settings/usage"))).toThrow(
      "Missing operator surface link for /settings/usage"
    );
    expect(() => getDemoOperationsCheckpoints(withoutSurfaceRoute(operatorSurfaceGroups, "/settings/contacts"))).toThrow(
      "Missing operator surface link for /settings/contacts"
    );
    expect(() => getWorkflowOperationSteps(withoutSurfaceRoute(operatorSurfaceGroups, "/settings/queue"))).toThrow(
      "Missing operator surface link for /settings/queue"
    );
    expect(() => getIntegrationOperationAreas(withoutSurfaceRoute(operatorSurfaceGroups, "/settings/provider"))).toThrow(
      "Missing operator surface link for /settings/provider"
    );
  });

  it("keeps broad inventory projections scoped to the supplied inventory", () => {
    const groups = withoutSurfaceRoute(operatorSurfaceGroups, "/settings/usage");
    const expectedRoutes = groups.flatMap((group) => group.links.map((link) => link.href));
    const broadProjectionRouteSets = [
      { name: "summary", routes: getOperatorSurfaceSummary(groups).routes },
      { name: "runbook", routes: getRunbookAdminLinks(groups).map((link) => link.href) },
      { name: "settings", routes: getSettingsNavigationLinks(groups).map((link) => link.href) },
      { name: "launch", routes: getLaunchDashboardLinks(groups).map((link) => link.href) },
      { name: "demo console", routes: getDemoConsoleLinks(groups).map((link) => link.href) }
    ];

    expect(getOperatorSurfaceSummary(groups).surfaceCount).toBe(34);

    for (const projection of broadProjectionRouteSets) {
      expect(projection.routes, projection.name).not.toContain("/settings/usage");
      expect(projection.routes.filter((route) => !expectedRoutes.includes(route)), projection.name).toEqual([]);
    }

    expect(getLaunchDashboardLinks(groups).map((link) => link.href)).toEqual(expectedRoutes);
  });

  it("derives projected operator copy from the supplied inventory", () => {
    const groups = withCustomSurfaceCopy(operatorSurfaceGroups, "/settings/usage", {
      label: "Usage Review",
      note: "custom local usage note"
    });
    const usageLink = { href: "/settings/usage", label: "Usage Review", note: "custom local usage note" };

    expect(getLaunchDashboardLinks(groups).find((link) => link.href === "/settings/usage")).toEqual(usageLink);
    expect(getSettingsNavigationLinks(groups).find((link) => link.href === "/settings/usage")).toEqual(usageLink);
    expect(getReportingIndexLinks(groups).find((link) => link.href === "/settings/usage")).toEqual(usageLink);
    expect(getBillingOperationLinks(groups).find((link) => link.href === "/settings/usage")).toEqual(usageLink);
  });

  it("derives every operator projection link copy from the supplied inventory", () => {
    const groups = withRouteStampedSurfaceCopy(operatorSurfaceGroups);
    const inventoryLinks = groups.flatMap((group) => group.links);
    const inventoryByRoute = new Map(inventoryLinks.map((link) => [link.href, link]));
    const projectedLinkSets = [
      { name: "runbook", links: getRunbookAdminLinks(groups) },
      { name: "settings", links: getSettingsNavigationLinks(groups) },
      { name: "launch", links: getLaunchDashboardLinks(groups) },
      { name: "demo console", links: getDemoConsoleLinks(groups) },
      { name: "demo operations", links: getDemoOperationsLinks(groups) },
      { name: "reporting", links: getReportingIndexLinks(groups) },
      { name: "release", links: getReleaseOperationSurfaceLinks(groups) },
      { name: "security", links: getSecurityOperationLinks(groups) },
      { name: "environment", links: getEnvironmentOperationLinks(groups) },
      { name: "health", links: getHealthOperationLinks(groups) },
      { name: "contract", links: getContractOperationLinks(groups) },
      { name: "validation", links: getValidationOperationLinks(groups) },
      { name: "queue", links: getQueueOperationLinks(groups) },
      { name: "contacts", links: getContactOperationLinks(groups) },
      { name: "campaigns", links: getCampaignOperationLinks(groups) },
      { name: "audience", links: getAudienceOperationLinks(groups) },
      { name: "templates", links: getTemplateOperationLinks(groups) },
      { name: "inbox", links: getInboxOperationLinks(groups) },
      { name: "data", links: getDataOperationLinks(groups) },
      { name: "notifications", links: getNotificationOperationLinks(groups) },
      { name: "exports", links: getExportOperationLinks(groups) },
      { name: "webhooks", links: getWebhookOperationLinks(groups) },
      { name: "delivery", links: getDeliveryOperationLinks(groups) },
      { name: "team", links: getTeamOperationLinks(groups) },
      { name: "billing", links: getBillingOperationLinks(groups) },
      { name: "ai", links: getAiOperationLinks(groups) },
      { name: "provider", links: getProviderOperationLinks(groups) },
      { name: "numbers", links: getNumberOperationLinks(groups) },
      { name: "compliance", links: getComplianceOperationLinks(groups) },
      { name: "system", links: getSystemOperationLinks(groups) },
      { name: "usage", links: getUsageOperationLinks(groups) },
      { name: "readiness audit", links: getReadinessAuditOperationLinks(groups) }
    ];

    for (const projection of projectedLinkSets) {
      expect(projection.links, projection.name).toEqual(projection.links.map((link) => inventoryByRoute.get(link.href)));
    }

    expect(getDemoOperationsCheckpoints(groups).map((checkpoint) => checkpoint.signal)).toEqual(
      getDemoOperationsCheckpoints(groups).map((checkpoint) => inventoryByRoute.get(checkpoint.href)?.label)
    );
    expect(getWorkflowOperationSteps(groups).map((step) => step.owner)).toEqual(
      getWorkflowOperationSteps(groups).map((step) => inventoryByRoute.get(step.href)?.label)
    );
    expect(getIntegrationOperationAreas(groups).map(({ href, label, note }) => ({ href, label, note }))).toEqual(
      getIntegrationOperationAreas(groups).map((area) => {
        const link = inventoryByRoute.get(area.href);
        return { href: link?.href, label: link?.label, note: link?.note };
      })
    );
  });

  it("keeps operator projections from mutating supplied inventories", () => {
    const groups = cloneSurfaceGroups(operatorSurfaceGroups);
    const originalGroups = cloneSurfaceGroups(groups);

    getOperatorSurfaceSummary(groups);
    getRunbookAdminLinks(groups);
    getSettingsNavigationLinks(groups);
    getLaunchDashboardLinks(groups);
    getDemoConsoleLinks(groups);
    getDemoOperationsCheckpoints(groups);
    getDemoOperationsLinks(groups);
    getReportingIndexLinks(groups);
    getWorkflowOperationSteps(groups);
    getReleaseOperationSurfaceLinks(groups);
    getIntegrationOperationAreas(groups);
    getSecurityOperationLinks(groups);
    getEnvironmentOperationLinks(groups);
    getHealthOperationLinks(groups);
    getContractOperationLinks(groups);
    getValidationOperationLinks(groups);
    getQueueOperationLinks(groups);
    getContactOperationLinks(groups);
    getCampaignOperationLinks(groups);
    getAudienceOperationLinks(groups);
    getTemplateOperationLinks(groups);
    getInboxOperationLinks(groups);
    getDataOperationLinks(groups);
    getNotificationOperationLinks(groups);
    getExportOperationLinks(groups);
    getWebhookOperationLinks(groups);
    getDeliveryOperationLinks(groups);
    getTeamOperationLinks(groups);
    getBillingOperationLinks(groups);
    getAiOperationLinks(groups);
    getProviderOperationLinks(groups);
    getNumberOperationLinks(groups);
    getComplianceOperationLinks(groups);
    getSystemOperationLinks(groups);
    getUsageOperationLinks(groups);
    getReadinessAuditOperationLinks(groups);

    expect(groups).toEqual(originalGroups);
  });

  it("keeps operator projection result arrays fresh and frozen per call", () => {
    const projectionFactories = [
      { name: "runbook", build: () => getRunbookAdminLinks() },
      { name: "settings", build: () => getSettingsNavigationLinks() },
      { name: "launch", build: () => getLaunchDashboardLinks() },
      { name: "demo console", build: () => getDemoConsoleLinks() },
      { name: "demo operations", build: () => getDemoOperationsLinks() },
      { name: "reporting", build: () => getReportingIndexLinks() },
      { name: "release", build: () => getReleaseOperationSurfaceLinks() },
      { name: "security", build: () => getSecurityOperationLinks() },
      { name: "environment", build: () => getEnvironmentOperationLinks() },
      { name: "health", build: () => getHealthOperationLinks() },
      { name: "contract", build: () => getContractOperationLinks() },
      { name: "validation", build: () => getValidationOperationLinks() },
      { name: "queue", build: () => getQueueOperationLinks() },
      { name: "contacts", build: () => getContactOperationLinks() },
      { name: "campaigns", build: () => getCampaignOperationLinks() },
      { name: "audience", build: () => getAudienceOperationLinks() },
      { name: "templates", build: () => getTemplateOperationLinks() },
      { name: "inbox", build: () => getInboxOperationLinks() },
      { name: "data", build: () => getDataOperationLinks() },
      { name: "notifications", build: () => getNotificationOperationLinks() },
      { name: "exports", build: () => getExportOperationLinks() },
      { name: "webhooks", build: () => getWebhookOperationLinks() },
      { name: "delivery", build: () => getDeliveryOperationLinks() },
      { name: "team", build: () => getTeamOperationLinks() },
      { name: "billing", build: () => getBillingOperationLinks() },
      { name: "ai", build: () => getAiOperationLinks() },
      { name: "provider", build: () => getProviderOperationLinks() },
      { name: "numbers", build: () => getNumberOperationLinks() },
      { name: "compliance", build: () => getComplianceOperationLinks() },
      { name: "system", build: () => getSystemOperationLinks() },
      { name: "usage", build: () => getUsageOperationLinks() },
      { name: "readiness audit", build: () => getReadinessAuditOperationLinks() },
      { name: "demo checkpoints", build: () => getDemoOperationsCheckpoints() },
      { name: "workflow steps", build: () => getWorkflowOperationSteps() },
      { name: "integration areas", build: () => getIntegrationOperationAreas() }
    ];

    for (const projection of projectionFactories) {
      const first = projection.build();
      const second = projection.build();
      const expectedLength = first.length;

      expect(first, projection.name).not.toBe(second);
      expect(Object.isFrozen(first), projection.name).toBe(true);

      expect(() => (first as unknown[]).pop()).toThrow(TypeError);

      expect(second, projection.name).toHaveLength(expectedLength);
      expect(projection.build(), projection.name).toHaveLength(expectedLength);
    }

    const summary = getOperatorSurfaceSummary();

    expect(Object.isFrozen(summary), "summary").toBe(true);
    expect(Object.isFrozen(summary.routes), "summary routes").toBe(true);
    expect(() => (summary.routes as string[]).pop()).toThrow(TypeError);
  });

  it("keeps every operator projection result object frozen per call", () => {
    const groups = withCustomSurfaceCopy(operatorSurfaceGroups, "/settings/usage", {
      label: "Usage Review",
      note: "custom local usage note"
    });
    const projectionFactories = [
      { name: "runbook", build: () => getRunbookAdminLinks(groups) },
      { name: "settings", build: () => getSettingsNavigationLinks(groups) },
      { name: "launch", build: () => getLaunchDashboardLinks(groups) },
      { name: "demo console", build: () => getDemoConsoleLinks(groups) },
      { name: "demo operations", build: () => getDemoOperationsLinks(groups) },
      { name: "reporting", build: () => getReportingIndexLinks(groups) },
      { name: "release", build: () => getReleaseOperationSurfaceLinks(groups) },
      { name: "security", build: () => getSecurityOperationLinks(groups) },
      { name: "environment", build: () => getEnvironmentOperationLinks(groups) },
      { name: "health", build: () => getHealthOperationLinks(groups) },
      { name: "contract", build: () => getContractOperationLinks(groups) },
      { name: "validation", build: () => getValidationOperationLinks(groups) },
      { name: "queue", build: () => getQueueOperationLinks(groups) },
      { name: "contacts", build: () => getContactOperationLinks(groups) },
      { name: "campaigns", build: () => getCampaignOperationLinks(groups) },
      { name: "audience", build: () => getAudienceOperationLinks(groups) },
      { name: "templates", build: () => getTemplateOperationLinks(groups) },
      { name: "inbox", build: () => getInboxOperationLinks(groups) },
      { name: "data", build: () => getDataOperationLinks(groups) },
      { name: "notifications", build: () => getNotificationOperationLinks(groups) },
      { name: "exports", build: () => getExportOperationLinks(groups) },
      { name: "webhooks", build: () => getWebhookOperationLinks(groups) },
      { name: "delivery", build: () => getDeliveryOperationLinks(groups) },
      { name: "team", build: () => getTeamOperationLinks(groups) },
      { name: "billing", build: () => getBillingOperationLinks(groups) },
      { name: "ai", build: () => getAiOperationLinks(groups) },
      { name: "provider", build: () => getProviderOperationLinks(groups) },
      { name: "numbers", build: () => getNumberOperationLinks(groups) },
      { name: "compliance", build: () => getComplianceOperationLinks(groups) },
      { name: "system", build: () => getSystemOperationLinks(groups) },
      { name: "usage", build: () => getUsageOperationLinks(groups) },
      { name: "readiness audit", build: () => getReadinessAuditOperationLinks(groups) },
      { name: "demo checkpoints", build: () => getDemoOperationsCheckpoints(groups) },
      { name: "workflow steps", build: () => getWorkflowOperationSteps(groups) },
      { name: "integration areas", build: () => getIntegrationOperationAreas(groups) }
    ];

    for (const projection of projectionFactories) {
      const results = projection.build();

      expect(results.length, projection.name).toBeGreaterThan(0);

      for (const result of results) {
        expect(Object.isFrozen(result), projection.name).toBe(true);
        expect(() => ((result as { href: string }).href = "/settings/unsafe")).toThrow(TypeError);
      }
    }

    const suppliedUsageLink = groups.flatMap((group) => group.links).find((link) => link.href === "/settings/usage");

    expect(suppliedUsageLink).toEqual({
      href: "/settings/usage",
      label: "Usage Review",
      note: "custom local usage note"
    });
    expect(getLaunchDashboardLinks(groups).find((link) => link.href === "/settings/usage")).toEqual(suppliedUsageLink);
  });

  it("keeps projected operator links detached from supplied inventory objects", () => {
    const groups = cloneSurfaceGroups(operatorSurfaceGroups);
    const inventoryLinks = groups.flatMap((group) => group.links);
    const projectedLinks = [
      ...getRunbookAdminLinks(groups),
      ...getSettingsNavigationLinks(groups),
      ...getLaunchDashboardLinks(groups),
      ...getDemoConsoleLinks(groups),
      ...getDemoOperationsLinks(groups),
      ...getReportingIndexLinks(groups),
      ...getReleaseOperationSurfaceLinks(groups),
      ...getSecurityOperationLinks(groups),
      ...getEnvironmentOperationLinks(groups),
      ...getHealthOperationLinks(groups),
      ...getContractOperationLinks(groups),
      ...getValidationOperationLinks(groups),
      ...getQueueOperationLinks(groups),
      ...getContactOperationLinks(groups),
      ...getCampaignOperationLinks(groups),
      ...getAudienceOperationLinks(groups),
      ...getTemplateOperationLinks(groups),
      ...getInboxOperationLinks(groups),
      ...getDataOperationLinks(groups),
      ...getNotificationOperationLinks(groups),
      ...getExportOperationLinks(groups),
      ...getWebhookOperationLinks(groups),
      ...getDeliveryOperationLinks(groups),
      ...getTeamOperationLinks(groups),
      ...getBillingOperationLinks(groups),
      ...getAiOperationLinks(groups),
      ...getProviderOperationLinks(groups),
      ...getNumberOperationLinks(groups),
      ...getComplianceOperationLinks(groups),
      ...getSystemOperationLinks(groups),
      ...getUsageOperationLinks(groups),
      ...getReadinessAuditOperationLinks(groups),
      ...getIntegrationOperationAreas(groups)
    ];

    for (const projectedLink of projectedLinks) {
      const sourceLink = inventoryLinks.find((link) => link.href === projectedLink.href);

      expect(
        {
          href: projectedLink.href,
          label: projectedLink.label,
          note: projectedLink.note
        },
        projectedLink.href
      ).toEqual(sourceLink);
      expect(projectedLink, projectedLink.href).not.toBe(sourceLink);
    }
  });

  it("keeps projected operator links limited to public navigation fields", () => {
    const groups = cloneSurfaceGroups(operatorSurfaceGroups);
    const projectedLinks = [
      ...getRunbookAdminLinks(groups),
      ...getSettingsNavigationLinks(groups),
      ...getLaunchDashboardLinks(groups),
      ...getDemoConsoleLinks(groups),
      ...getDemoOperationsLinks(groups),
      ...getReportingIndexLinks(groups),
      ...getReleaseOperationSurfaceLinks(groups),
      ...getSecurityOperationLinks(groups),
      ...getEnvironmentOperationLinks(groups),
      ...getHealthOperationLinks(groups),
      ...getContractOperationLinks(groups),
      ...getValidationOperationLinks(groups),
      ...getQueueOperationLinks(groups),
      ...getContactOperationLinks(groups),
      ...getCampaignOperationLinks(groups),
      ...getAudienceOperationLinks(groups),
      ...getTemplateOperationLinks(groups),
      ...getInboxOperationLinks(groups),
      ...getDataOperationLinks(groups),
      ...getNotificationOperationLinks(groups),
      ...getExportOperationLinks(groups),
      ...getWebhookOperationLinks(groups),
      ...getDeliveryOperationLinks(groups),
      ...getTeamOperationLinks(groups),
      ...getBillingOperationLinks(groups),
      ...getAiOperationLinks(groups),
      ...getProviderOperationLinks(groups),
      ...getNumberOperationLinks(groups),
      ...getComplianceOperationLinks(groups),
      ...getSystemOperationLinks(groups),
      ...getUsageOperationLinks(groups),
      ...getReadinessAuditOperationLinks(groups)
    ];
    const demoCheckpoints = getDemoOperationsCheckpoints(groups);
    const workflowSteps = getWorkflowOperationSteps(groups);
    const integrationAreas = getIntegrationOperationAreas(groups);

    for (const projectedLink of projectedLinks) {
      expect(Object.keys(projectedLink).sort(), projectedLink.href).toEqual(["href", "label", "note"].sort());
    }

    for (const checkpoint of demoCheckpoints) {
      expect(Object.keys(checkpoint).sort(), checkpoint.href).toEqual(["boundary", "href", "name", "signal"].sort());
    }

    for (const step of workflowSteps) {
      expect(Object.keys(step).sort(), step.href).toEqual(["boundary", "href", "name", "owner"].sort());
    }

    for (const area of integrationAreas) {
      expect(Object.keys(area).sort(), area.href).toEqual(["boundary", "href", "label", "note", "state"].sort());
    }
  });

  it("keeps the operator surface summary limited to public aggregate fields", () => {
    const groups = cloneSurfaceGroups(operatorSurfaceGroups);
    const summary = getOperatorSurfaceSummary(groups);

    expect(Object.keys(summary).sort()).toEqual(["groupCount", "routes", "surfaceCount"].sort());
    expect(summary.groupCount).toBe(groups.length);
    expect(summary.surfaceCount).toBe(groups.flatMap((group) => group.links).length);
    expect(summary.routes).toEqual(groups.flatMap((group) => group.links.map((link) => link.href)));
    expect(summary.routes.some((route) => route.includes("unsafe-"))).toBe(false);
  });

  it("keeps operator surface summary route arrays fresh per call", () => {
    const first = getOperatorSurfaceSummary();
    const second = getOperatorSurfaceSummary();
    const firstRouteCount = first.routes.length;

    expect(first).not.toBe(second);
    expect(first.routes).not.toBe(second.routes);
    expect(Object.isFrozen(first.routes)).toBe(true);
    expect(() => (first.routes as string[]).pop()).toThrow(TypeError);
    expect(second.routes).toHaveLength(firstRouteCount);
    expect(getOperatorSurfaceSummary().routes).toHaveLength(firstRouteCount);
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

  it("keeps rich operator projection copy unambiguous and boundary-oriented", () => {
    const checkpoints = getDemoOperationsCheckpoints();
    const workflowSteps = getWorkflowOperationSteps();
    const integrationAreas = getIntegrationOperationAreas();
    const copySets = [
      { name: "checkpoint names", values: checkpoints.map((checkpoint) => checkpoint.name) },
      { name: "checkpoint signals", values: checkpoints.map((checkpoint) => checkpoint.signal) },
      { name: "checkpoint boundaries", values: checkpoints.map((checkpoint) => checkpoint.boundary) },
      { name: "workflow names", values: workflowSteps.map((step) => step.name) },
      { name: "workflow owners", values: workflowSteps.map((step) => step.owner) },
      { name: "workflow boundaries", values: workflowSteps.map((step) => step.boundary) },
      { name: "integration labels", values: integrationAreas.map((area) => area.label) },
      { name: "integration states", values: integrationAreas.map((area) => area.state) },
      { name: "integration boundaries", values: integrationAreas.map((area) => area.boundary) }
    ];

    for (const copySet of copySets) {
      expect(new Set(copySet.values).size, copySet.name).toBe(copySet.values.length);
      expect(copySet.values.filter((value) => value.trim() !== value || value.includes("  ")), copySet.name).toEqual([]);
    }

    const allBoundaries = [
      ...checkpoints.map((checkpoint) => checkpoint.boundary),
      ...workflowSteps.map((step) => step.boundary),
      ...integrationAreas.map((area) => area.boundary)
    ];

    expect(allBoundaries.filter((boundary) => !/\b(without|no|not|blocked)\b/i.test(boundary))).toEqual([]);
    expect(integrationAreas.map((area) => area.state).filter((state) => state !== state.toLowerCase())).toEqual([]);
  });

  it("keeps rich operator boundaries explicit about external-impact exclusions", () => {
    const allBoundaries = [
      ...getDemoOperationsCheckpoints().map((checkpoint) => checkpoint.boundary),
      ...getWorkflowOperationSteps().map((step) => step.boundary),
      ...getIntegrationOperationAreas().map((area) => area.boundary)
    ];
    const externalImpactTerms =
      /\b(provider|providers|send|sending|sends|sms|message|messages|billing|stripe|paid model|paid models|twilio|mutation|mutating|exports|enqueueing|polling|redis|charge|charges|prompts|replies|consent|scheduling|canceling|assigning)\b/i;

    expect(allBoundaries.filter((boundary) => !externalImpactTerms.test(boundary))).toEqual([]);
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
