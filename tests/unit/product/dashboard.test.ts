import { UsageEventType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getProductDashboard, productNavigation } from "@/lib/product/dashboard";

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
      count: vi.fn(async () => 12)
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
      }
    });
  });
});
