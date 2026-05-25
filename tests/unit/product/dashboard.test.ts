import { UsageEventType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { productComplianceFields } from "@/lib/product/compliance";
import {
  getProductDashboard,
  productDashboardActions,
  productDashboardMetricRows,
  productDashboardSections,
  productDashboardSignalRows,
  productNavigation
} from "@/lib/product/dashboard";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contact: {
      count: vi.fn(async ({ where }: { where: { consentStatus?: string } }) => {
        if (where.consentStatus === "OPTED_IN") {
          return 7;
        }
        if (where.consentStatus === "OPTED_OUT") {
          return 2;
        }
        return 10;
      })
    },
    campaign: {
      count: vi.fn(async ({ where }: { where: { status?: string } }) => {
        if (where.status === "DRAFT") {
          return 3;
        }
        if (where.status === "SCHEDULED") {
          return 1;
        }
        return 5;
      })
    },
    conversation: {
      count: vi.fn(async () => 4)
    },
    messageTemplate: {
      count: vi.fn(async () => 6)
    },
    message: {
      count: vi.fn(
        async ({
          where
        }: {
          where: {
            direction?: string;
            deliveredAt?: { not: null };
            OR?: Array<Record<string, unknown>>;
          };
        }) => {
          if (where.direction === "OUTBOUND") {
            return 5;
          }
          if (where.deliveredAt) {
            return 4;
          }
          if (where.OR) {
            return 1;
          }

          return 12;
        }
      )
    },
    complianceProfile: {
      findUnique: vi.fn(async () => ({
        businessName: "SignalStack Demo Co",
        messagingUseCase: "Appointment reminders",
        optInDescription: "Customers opt in on local forms.",
        privacyPolicyUrl: "https://example.test/privacy",
        termsOfServiceUrl: "https://example.test/terms",
        a2pRegistrationStatus: "NOT_STARTED"
      }))
    },
    usageEvent: {
      findMany: vi.fn(async () => [
        { type: UsageEventType.AI_REQUEST, quantity: 2 },
        { type: UsageEventType.CAMPAIGN_SCHEDULED, quantity: 1 }
      ])
    }
  }
}));

describe("product dashboard navigation", () => {
  it("keeps the primary product areas in stable order", () => {
    expect(productNavigation.map((item) => item.label)).toEqual([
      "Contacts",
      "Campaigns",
      "Inbox",
      "Templates",
      "Analytics",
      "Compliance",
      "Settings"
    ]);
    expect(productNavigation.map((item) => item.href)).toEqual([
      "/dashboard/contacts",
      "/dashboard/campaigns",
      "/dashboard/inbox",
      "/dashboard/templates",
      "/dashboard/analytics",
      "/dashboard/compliance",
      "/settings"
    ]);
  });

  it("is deeply frozen before the product shell renders navigation", () => {
    expect(Object.isFrozen(productNavigation)).toBe(true);
    expect(productNavigation.every((item) => Object.isFrozen(item))).toBe(true);
    expect(() =>
      (productNavigation as unknown as Array<{ href: string; label: string; note: string }>).push({
        href: "#unsafe",
        label: "Unsafe",
        note: "unsafe route"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productNavigation[0] as { href: string }).href = "#unsafe";
    }).toThrow(TypeError);
  });

  it("freezes dashboard metric metadata before rendering", () => {
    expect(Object.isFrozen(productDashboardMetricRows)).toBe(true);
    expect(productDashboardMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productDashboardMetricRows.map((row) => row.key)).toEqual([
      "activeContacts",
      "campaigns",
      "openConversations",
      "templates"
    ]);

    expect(() =>
      (productDashboardMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productDashboardMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productDashboardMetricRows[0].label).toBe("Active Contacts");
  });

  it("freezes dashboard action metadata before rendering", () => {
    expect(Object.isFrozen(productDashboardActions)).toBe(true);
    expect(productDashboardActions.every((action) => Object.isFrozen(action))).toBe(true);
    expect(productDashboardActions.map((action) => action.href)).toEqual(["/demo", "/settings"]);
    expect(productDashboardActions.map((action) => action.label)).toEqual(["Demo Console", "Go-Live Settings"]);
    expect(productDashboardActions.map((action) => action.style)).toEqual(["secondary", "primary"]);

    expect(() =>
      (productDashboardActions as unknown as Array<{ href: string; label: string; style: string }>).push({
        href: "#unsafe",
        label: "Unsafe",
        style: "primary"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productDashboardActions[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productDashboardActions[0].label).toBe("Demo Console");
  });

  it("freezes dashboard local signal metadata before rendering", () => {
    expect(Object.isFrozen(productDashboardSignalRows)).toBe(true);
    expect(productDashboardSignalRows.every((signal) => Object.isFrozen(signal))).toBe(true);
    expect(productDashboardSignalRows.map((signal) => signal.key)).toEqual([
      "consentCoverage",
      "optInRate",
      "scheduledWork",
      "deliveryRate",
      "deliveryFailures",
      "inboxLoad",
      "fakeAiRequests",
      "localUsageEvents"
    ]);
    expect(productDashboardSignalRows.map((signal) => signal.label)).toEqual([
      "Consent coverage",
      "Opt-in rate",
      "Scheduled work",
      "Delivery rate",
      "Delivery failures",
      "Inbox load",
      "Fake AI requests",
      "Local usage events"
    ]);

    expect(() =>
      (productDashboardSignalRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productDashboardSignalRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productDashboardSignalRows[0].label).toBe("Consent coverage");
  });

  it("freezes dashboard section status metadata before rendering", () => {
    expect(Object.isFrozen(productDashboardSections)).toBe(true);
    expect(productDashboardSections.every((section) => Object.isFrozen(section))).toBe(true);
    expect(productDashboardSections.every((section) => Object.isFrozen(section.rows))).toBe(true);
    expect(productDashboardSections.every((section) => section.rows.every((row) => Object.isFrozen(row)))).toBe(true);
    expect(productDashboardSections.map((section) => section.id)).toEqual([
      "contacts",
      "compliance",
      "campaigns",
      "inbox",
      "templates"
    ]);
    expect(productDashboardSections.map((section) => section.title)).toEqual([
      "Contacts",
      "Compliance",
      "Campaigns",
      "Inbox",
      "Templates"
    ]);
    expect(productDashboardSections[0].rows.map((row) => row.key)).toEqual([
      "activeContacts",
      "optedIn",
      "optedOut"
    ]);
    expect(productDashboardSections[1].rows.map((row) => row.label)).toEqual([
      "Profile fields",
      "A2P status",
      "Live messaging"
    ]);

    expect(() =>
      (productDashboardSections as unknown as Array<{ id: string }>).push({
        id: "unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productDashboardSections[0] as { title: string }).title = "Unsafe";
    }).toThrow(TypeError);
    expect(() =>
      (productDashboardSections[0].rows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productDashboardSections[0].rows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productDashboardSections[0].title).toBe("Contacts");
    expect(productDashboardSections[0].rows[0].label).toBe("Active contacts");
  });

  it("projects local usage totals for the product dashboard without live providers", async () => {
    await expect(getProductDashboard("org_1")).resolves.toMatchObject({
      contacts: {
        total: 10,
        optedIn: 7,
        optedOut: 2,
        optedInPercent: 70
      },
      campaigns: {
        total: 5,
        draft: 3,
        scheduled: 1
      },
      usage: {
        fakeAiRequests: 2,
        totalEvents: 3
      },
      delivery: {
        outbound: 5,
        delivered: 4,
        failed: 1,
        deliveryRatePercent: 80
      },
      compliance: {
        completeFields: productComplianceFields.length,
        requiredFields: productComplianceFields.length,
        a2pRegistrationStatus: "NOT_STARTED"
      },
      metrics: [
        { key: "activeContacts", label: "Active Contacts", value: 10, detail: "7 opted in" },
        { key: "campaigns", label: "Campaigns", value: 5, detail: "3 drafts" },
        { key: "openConversations", label: "Open Conversations", value: 4, detail: "12 messages" },
        { key: "templates", label: "Templates", value: 6, detail: "ready for campaign copy" }
      ],
      signals: [
        { key: "consentCoverage", label: "Consent coverage", value: "7/10" },
        { key: "optInRate", label: "Opt-in rate", value: "70%" },
        { key: "scheduledWork", label: "Scheduled work", value: "1" },
        { key: "deliveryRate", label: "Delivery rate", value: "80%" },
        { key: "deliveryFailures", label: "Delivery failures", value: "1" },
        { key: "inboxLoad", label: "Inbox load", value: "4" },
        { key: "fakeAiRequests", label: "Fake AI requests", value: "2" },
        { key: "localUsageEvents", label: "Local usage events", value: "3" }
      ],
      sections: [
        {
          id: "contacts",
          title: "Contacts",
          eyebrow: "Audience",
          rows: [
            { key: "activeContacts", label: "Active contacts", value: "10" },
            { key: "optedIn", label: "Opted in", value: "7" },
            { key: "optedOut", label: "Opted out", value: "2" }
          ]
        },
        {
          id: "compliance",
          title: "Compliance",
          eyebrow: "Readiness",
          rows: [
            { key: "profileFields", label: "Profile fields", value: `${productComplianceFields.length}/${productComplianceFields.length}` },
            { key: "a2pStatus", label: "A2P status", value: "NOT_STARTED" },
            { key: "liveMessaging", label: "Live messaging", value: "blocked by default" }
          ]
        },
        {
          id: "campaigns",
          title: "Campaigns",
          eyebrow: "Marketing",
          rows: [
            { key: "totalCampaigns", label: "Total campaigns", value: "5" },
            { key: "drafts", label: "Drafts", value: "3" },
            { key: "scheduled", label: "Scheduled", value: "1" }
          ]
        },
        {
          id: "inbox",
          title: "Inbox",
          eyebrow: "Response",
          rows: [
            { key: "openThreads", label: "Open threads", value: "4" },
            { key: "localMessages", label: "Local messages", value: "12" },
            { key: "providerSends", label: "Provider sends", value: "disabled" }
          ]
        },
        {
          id: "templates",
          title: "Templates",
          eyebrow: "Copy",
          rows: [
            { key: "savedTemplates", label: "Saved templates", value: "6" },
            { key: "aiProvider", label: "AI provider", value: "fake by default" },
            { key: "liveAi", label: "Live AI", value: "blocked" }
          ]
        }
      ]
    });
  });
});
