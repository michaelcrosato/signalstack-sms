import { CampaignStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listCampaigns,
  listCampaignsWithDelivery,
  getCampaign,
  getCampaignWithMessages,
  createCampaign,
  updateCampaign,
} from "@/lib/db/repositories/campaigns";

const mocks = vi.hoisted(() => ({
  campaignFindMany: vi.fn(),
  campaignFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  campaignCreate: vi.fn(),
  campaignUpdate: vi.fn(),
  campaignFindUniqueOrThrow: vi.fn(),
  campaignRecipientDeleteMany: vi.fn(),
  campaignRecipientCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  templateFindFirst: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    campaign: {
      findMany: mocks.campaignFindMany,
      findFirst: mocks.campaignFindFirst,
    },
    message: {
      findMany: mocks.messageFindMany,
    },
    $transaction: mocks.transaction
  }
}));

describe("Campaigns Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      campaign: {
        findMany: mocks.campaignFindMany,
        findFirst: mocks.campaignFindFirst
      },
      message: {
        findMany: mocks.messageFindMany
      }
    }));
  });

  describe("listCampaigns", () => {
    it("should list campaigns for a specific org", async () => {
      const mockCampaigns = [{ id: "c1", orgId: "org1" }];
      mocks.campaignFindMany.mockResolvedValue(mockCampaigns);

      const result = await listCampaigns("org1");

      expect(result).toEqual(mockCampaigns);
      expect(mocks.campaignFindMany).toHaveBeenCalledWith({
        where: { orgId: "org1" },
        orderBy: { updatedAt: "desc" },
        include: expect.any(Object)
      });
    });
  });

  describe("listCampaignsWithDelivery", () => {
    it("should list campaigns with delivery info for a specific org", async () => {
      const mockCampaigns = [{ id: "c1", orgId: "org1" }];
      mocks.campaignFindMany.mockResolvedValue(mockCampaigns);

      const result = await listCampaignsWithDelivery("org1");

      expect(result).toEqual(mockCampaigns);
      expect(mocks.campaignFindMany).toHaveBeenCalledWith({
        where: { orgId: "org1" },
        orderBy: { updatedAt: "desc" },
        include: expect.any(Object)
      });
    });
  });

  describe("getCampaign", () => {
    it("should get a specific campaign", async () => {
      const mockCampaign = { id: "c1", orgId: "org1" };
      mocks.campaignFindFirst.mockResolvedValue(mockCampaign);

      const result = await getCampaign("org1", "c1");

      expect(result).toEqual(mockCampaign);
      expect(mocks.campaignFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "c1" },
        include: expect.any(Object)
      });
    });
  });

  describe("getCampaignWithMessages", () => {
    it("should return null if campaign is not found", async () => {
      mocks.campaignFindFirst.mockResolvedValue(null);

      const result = await getCampaignWithMessages("org1", "c1");

      expect(result).toBeNull();
      expect(mocks.campaignFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "c1" },
        include: expect.any(Object)
      });
      expect(mocks.messageFindMany).not.toHaveBeenCalled();
    });

    it("should get campaign with its delivery messages", async () => {
      const mockCampaign = { id: "c1", orgId: "org1" };
      const mockMessages = [{ id: "m1", direction: "OUTBOUND" }];
      mocks.campaignFindFirst.mockResolvedValue(mockCampaign);
      mocks.messageFindMany.mockResolvedValue(mockMessages);

      const result = await getCampaignWithMessages("org1", "c1");

      expect(result).toEqual({ ...mockCampaign, deliveryMessages: mockMessages });
      expect(mocks.campaignFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "c1" },
        include: expect.any(Object)
      });
      expect(mocks.messageFindMany).toHaveBeenCalledWith({
        where: { orgId: "org1", campaignId: "c1", direction: "OUTBOUND" },
        orderBy: { createdAt: "asc" },
        select: expect.any(Object)
      });
    });
  });


  describe("createCampaign", () => {
    beforeEach(() => {
      mocks.transaction.mockImplementation(async (callback) => {
        return callback({
          campaign: {
            create: mocks.campaignCreate,
            findUniqueOrThrow: mocks.campaignFindUniqueOrThrow,
          },
          campaignRecipient: {
            deleteMany: mocks.campaignRecipientDeleteMany,
            create: mocks.campaignRecipientCreate,
          },
          contact: {
            findFirst: mocks.contactFindFirst,
          },
          messageTemplate: {
            findFirst: mocks.templateFindFirst,
          }
        });
      });
    });

    it("should create a campaign and sync recipients", async () => {
      const input = { name: "Test Campaign", body: "Hello", templateId: "t1", contactIds: ["contact1"] };
      const createdCampaign = { id: "new-campaign-id", orgId: "org1", name: input.name };
      const finalCampaign = { ...createdCampaign, template: null, recipients: [] };

      mocks.campaignCreate.mockResolvedValue(createdCampaign);
      mocks.contactFindFirst.mockResolvedValue({ id: "contact1" });
      mocks.templateFindFirst.mockResolvedValue({ id: "t1" });
      mocks.campaignFindUniqueOrThrow.mockResolvedValue(finalCampaign);

      const result = await createCampaign("org1", input);

      expect(result).toEqual(finalCampaign);
      expect(mocks.campaignCreate).toHaveBeenCalledWith({
        data: { orgId: "org1", name: "Test Campaign", body: "Hello", templateId: "t1" }
      });
      expect(mocks.campaignRecipientDeleteMany).toHaveBeenCalledWith({
        where: { orgId: "org1", campaignId: "new-campaign-id" }
      });
      expect(mocks.contactFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "contact1" }
      });
      expect(mocks.campaignRecipientCreate).toHaveBeenCalledWith({
        data: { orgId: "org1", campaignId: "new-campaign-id", contactId: "contact1" }
      });
      expect(mocks.campaignFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: "new-campaign-id" },
        include: expect.any(Object)
      });
    });

    it("rejects a missing or cross-tenant template before creating the campaign", async () => {
      mocks.templateFindFirst.mockResolvedValue(null);

      await expect(
        createCampaign("org1", {
          name: "Test Campaign",
          body: "Hello",
          templateId: "foreign-template",
          contactIds: []
        })
      ).rejects.toThrow("Campaign template not found.");

      expect(mocks.templateFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "foreign-template" },
        select: { id: true }
      });
      expect(mocks.campaignCreate).not.toHaveBeenCalled();
    });
  });

  describe("updateCampaign", () => {
    beforeEach(() => {
      mocks.transaction.mockImplementation(async (callback) => {
        return callback({
          campaign: {
            findFirst: mocks.campaignFindFirst,
            update: mocks.campaignUpdate,
            findUniqueOrThrow: mocks.campaignFindUniqueOrThrow,
          },
          campaignRecipient: {
            deleteMany: mocks.campaignRecipientDeleteMany,
            create: mocks.campaignRecipientCreate,
          },
          contact: {
            findFirst: mocks.contactFindFirst,
          },
          messageTemplate: {
            findFirst: mocks.templateFindFirst,
          }
        });
      });
    });

    it("should return null if existing campaign is not found", async () => {
      mocks.campaignFindFirst.mockResolvedValue(null);

      const result = await updateCampaign("org1", "c1", { name: "New Name" });

      expect(result).toBeNull();
      expect(mocks.campaignFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "c1" }
      });
      expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    });

    it("should throw an error if campaign is not in DRAFT status", async () => {
      mocks.campaignFindFirst.mockResolvedValue({ id: "c1", status: CampaignStatus.SCHEDULED });

      await expect(updateCampaign("org1", "c1", { name: "New Name" })).rejects.toThrow("Only draft campaigns can be edited.");
      expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    });

    it("should update campaign details and optionally sync recipients", async () => {
      const input = { name: "New Name", contactIds: ["contact2"] };
      const existingCampaign = { id: "c1", status: CampaignStatus.DRAFT };
      const updatedCampaign = { id: "c1", name: "New Name" };
      const finalCampaign = { ...updatedCampaign, template: null, recipients: [] };

      mocks.campaignFindFirst.mockResolvedValue(existingCampaign);
      mocks.campaignUpdate.mockResolvedValue(updatedCampaign);
      mocks.contactFindFirst.mockResolvedValue({ id: "contact2" });
      mocks.campaignFindUniqueOrThrow.mockResolvedValue(finalCampaign);

      const result = await updateCampaign("org1", "c1", input);

      expect(result).toEqual(finalCampaign);
      expect(mocks.campaignUpdate).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { name: "New Name", body: undefined, templateId: undefined }
      });
      expect(mocks.campaignRecipientDeleteMany).toHaveBeenCalledWith({
        where: { orgId: "org1", campaignId: "c1" }
      });
      expect(mocks.contactFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "contact2" }
      });
      expect(mocks.campaignRecipientCreate).toHaveBeenCalledWith({
        data: { orgId: "org1", campaignId: "c1", contactId: "contact2" }
      });
      expect(mocks.campaignFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: "c1" },
        include: expect.any(Object)
      });
    });

    it("rejects a cross-tenant template before changing a draft", async () => {
      mocks.campaignFindFirst.mockResolvedValue({ id: "c1", status: CampaignStatus.DRAFT });
      mocks.templateFindFirst.mockResolvedValue(null);

      await expect(
        updateCampaign("org1", "c1", { templateId: "foreign-template" })
      ).rejects.toThrow("Campaign template not found.");

      expect(mocks.templateFindFirst).toHaveBeenCalledWith({
        where: { orgId: "org1", id: "foreign-template" },
        select: { id: true }
      });
      expect(mocks.campaignUpdate).not.toHaveBeenCalled();
    });
  });

});
