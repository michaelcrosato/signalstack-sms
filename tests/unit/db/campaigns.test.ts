import { CampaignStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listCampaigns,
  listCampaignsWithDelivery,
  getCampaign,
  getCampaignWithMessages,
  createCampaign,
  updateCampaign
} from "@/lib/db/repositories/campaigns";
import type { CampaignCreateInput, CampaignUpdateInput } from "@/lib/validation/campaigns";

const mocks = vi.hoisted(() => ({
  campaignFindMany: vi.fn(),
  campaignFindFirst: vi.fn(),
  campaignCreate: vi.fn(),
  campaignUpdate: vi.fn(),
  campaignFindUniqueOrThrow: vi.fn(),
  messageFindMany: vi.fn(),
  campaignRecipientDeleteMany: vi.fn(),
  campaignRecipientCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    campaign: {
      findMany: mocks.campaignFindMany,
      findFirst: mocks.campaignFindFirst
    },
    message: {
      findMany: mocks.messageFindMany
    },
    $transaction: mocks.transaction
  }
}));

describe("campaigns repository CRUD", () => {
  const orgId = "org_demo";
  const campaignId = "campaign_demo";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        campaign: {
          create: mocks.campaignCreate,
          update: mocks.campaignUpdate,
          findFirst: mocks.campaignFindFirst,
          findUniqueOrThrow: mocks.campaignFindUniqueOrThrow
        },
        contact: {
          findFirst: mocks.contactFindFirst
        },
        campaignRecipient: {
          deleteMany: mocks.campaignRecipientDeleteMany,
          create: mocks.campaignRecipientCreate
        }
      })
    );
  });

  describe("listCampaigns", () => {
    it("fetches campaigns for an organization with the correct include", async () => {
      const mockResult = [{ id: "1", name: "C1" }];
      mocks.campaignFindMany.mockResolvedValue(mockResult);

      const result = await listCampaigns(orgId);

      expect(result).toEqual(mockResult);
      expect(mocks.campaignFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId },
          orderBy: { updatedAt: "desc" },
          include: expect.objectContaining({ template: true })
        })
      );
    });
  });

  describe("listCampaignsWithDelivery", () => {
    it("fetches campaigns with delivery messages for an organization", async () => {
      const mockResult = [{ id: "1", name: "C1" }];
      mocks.campaignFindMany.mockResolvedValue(mockResult);

      const result = await listCampaignsWithDelivery(orgId);

      expect(result).toEqual(mockResult);
      expect(mocks.campaignFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId },
          orderBy: { updatedAt: "desc" },
          include: expect.objectContaining({ messages: expect.any(Object) })
        })
      );
    });
  });

  describe("getCampaign", () => {
    it("fetches a single campaign by orgId and campaignId", async () => {
      const mockResult = { id: campaignId, name: "C1" };
      mocks.campaignFindFirst.mockResolvedValue(mockResult);

      const result = await getCampaign(orgId, campaignId);

      expect(result).toEqual(mockResult);
      expect(mocks.campaignFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: campaignId }),
          include: expect.any(Object)
        })
      );
    });
  });

  describe("getCampaignWithMessages", () => {
    it("returns null if campaign does not exist", async () => {
      mocks.campaignFindFirst.mockResolvedValue(null);

      const result = await getCampaignWithMessages(orgId, campaignId);

      expect(result).toBeNull();
      expect(mocks.messageFindMany).not.toHaveBeenCalled();
    });

    it("fetches campaign and delivery messages", async () => {
      const mockCampaign = { id: campaignId, name: "C1" };
      const mockMessages = [{ id: "msg1" }];

      mocks.campaignFindFirst.mockResolvedValue(mockCampaign);
      mocks.messageFindMany.mockResolvedValue(mockMessages);

      const result = await getCampaignWithMessages(orgId, campaignId);

      expect(result).toEqual({ ...mockCampaign, deliveryMessages: mockMessages });
      expect(mocks.campaignFindFirst).toHaveBeenCalled();
      expect(mocks.messageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ campaignId, direction: "OUTBOUND" }),
          orderBy: { createdAt: "asc" }
        })
      );
    });
  });

  describe("createCampaign", () => {
    it("creates campaign and syncs recipients", async () => {
      const input: CampaignCreateInput = {
        name: "Test",
        body: "Hello",
        templateId: "tpl1",
        contactIds: ["c1", "c2", "c2"] // Testing dedup
      };

      const createdCampaign = { id: campaignId, orgId };
      mocks.campaignCreate.mockResolvedValue(createdCampaign);
      mocks.contactFindFirst.mockResolvedValue({ id: "c1" }); // Mock finding a contact
      mocks.campaignFindUniqueOrThrow.mockResolvedValue(createdCampaign);

      const result = await createCampaign(orgId, input);

      expect(result).toEqual(createdCampaign);
      expect(mocks.campaignCreate).toHaveBeenCalledWith({
        data: {
          orgId,
          name: "Test",
          body: "Hello",
          templateId: "tpl1"
        }
      });

      // Checking syncCampaignRecipients logic
      expect(mocks.campaignRecipientDeleteMany).toHaveBeenCalledWith({
        where: { orgId, campaignId }
      });

      // Should have been called twice (deduping "c2")
      expect(mocks.contactFindFirst).toHaveBeenCalledTimes(2);
      expect(mocks.campaignRecipientCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("updateCampaign", () => {
    it("returns null if campaign does not exist", async () => {
      mocks.campaignFindFirst.mockResolvedValue(null);

      const input: CampaignUpdateInput = { name: "Updated" };
      const result = await updateCampaign(orgId, campaignId, input);

      expect(result).toBeNull();
      expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    });

    it("throws if campaign is not in DRAFT status", async () => {
      mocks.campaignFindFirst.mockResolvedValue({ status: CampaignStatus.SCHEDULED });

      const input: CampaignUpdateInput = { name: "Updated" };
      await expect(updateCampaign(orgId, campaignId, input)).rejects.toThrow("Only draft campaigns can be edited.");
      expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    });

    it("updates campaign properties and does not sync recipients if contactIds is absent", async () => {
      mocks.campaignFindFirst.mockResolvedValue({ id: campaignId, status: CampaignStatus.DRAFT });
      const updatedCampaign = { id: campaignId, name: "Updated" };
      mocks.campaignUpdate.mockResolvedValue(updatedCampaign);
      mocks.campaignFindUniqueOrThrow.mockResolvedValue(updatedCampaign);

      const input: CampaignUpdateInput = { name: "Updated", body: "New Body" };
      const result = await updateCampaign(orgId, campaignId, input);

      expect(result).toEqual(updatedCampaign);
      expect(mocks.campaignUpdate).toHaveBeenCalledWith({
        where: { id: campaignId },
        data: {
          name: "Updated",
          body: "New Body",
          templateId: undefined
        }
      });
      expect(mocks.campaignRecipientDeleteMany).not.toHaveBeenCalled();
    });

    it("updates campaign properties and syncs recipients if contactIds is provided", async () => {
      mocks.campaignFindFirst.mockResolvedValue({ id: campaignId, status: CampaignStatus.DRAFT });
      const updatedCampaign = { id: campaignId, name: "Updated" };
      mocks.campaignUpdate.mockResolvedValue(updatedCampaign);
      mocks.campaignFindUniqueOrThrow.mockResolvedValue(updatedCampaign);
      mocks.contactFindFirst.mockResolvedValue({ id: "c1" });

      const input: CampaignUpdateInput = { name: "Updated", contactIds: ["c1"] };
      const result = await updateCampaign(orgId, campaignId, input);

      expect(result).toEqual(updatedCampaign);
      expect(mocks.campaignRecipientDeleteMany).toHaveBeenCalledWith({
        where: { orgId, campaignId }
      });
      expect(mocks.campaignRecipientCreate).toHaveBeenCalledTimes(1);
    });
  });
});
