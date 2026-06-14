import { CampaignStatus, ConsentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { preflightCampaign } from "@/lib/db/repositories/campaigns";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  contactFindMany: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    campaign: {
      findFirst: mocks.campaignFindFirst
    },
    contact: {
      findMany: mocks.contactFindMany
    }
  }
}));

describe("preflightCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without contact reads when the tenant campaign is missing", async () => {
    mocks.campaignFindFirst.mockResolvedValue(null);

    await expect(preflightCampaign("org_demo", "missing_campaign")).resolves.toBeNull();

    expect(mocks.campaignFindFirst).toHaveBeenCalledWith({
      where: { orgId: "org_demo", id: "missing_campaign" },
      include: { recipients: true }
    });
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
  });

  it("blocks requested contact IDs that do not resolve inside the current tenant", async () => {
    mocks.campaignFindFirst.mockResolvedValue({
      id: "campaign_demo",
      orgId: "org_demo",
      status: CampaignStatus.DRAFT,
      recipients: [{ contactId: "contact_allowed" }]
    });
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "contact_allowed",
        phone: "+15555550100",
        consentStatus: ConsentStatus.OPTED_IN,
        optedOutAt: null,
        archivedAt: null
      }
    ]);

    await expect(
      preflightCampaign("org_demo", "campaign_demo", ["contact_allowed", "contact_foreign"])
    ).resolves.toMatchObject({
      allowed: false,
      totalRecipients: 2,
      allowedRecipients: 1,
      blockedRecipients: 1,
      recipients: [
        {
          contactId: "contact_allowed",
          allowed: true,
          reasons: []
        },
        {
          contactId: "contact_foreign",
          allowed: false,
          reasons: ["CONTACT_NOT_FOUND"]
        }
      ]
    });

    expect(mocks.contactFindMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_demo",
        id: { in: ["contact_allowed", "contact_foreign"] }
      },
      select: {
        id: true,
        phone: true,
        consentStatus: true,
        optedOutAt: true,
        archivedAt: true
      }
    });
  });
});
