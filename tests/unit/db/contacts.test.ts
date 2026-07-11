import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  listContacts,
  listArchivedContacts,
  getContact,
  archiveContact,
  mergeContacts
} from "@/lib/db/repositories/contacts";
import { prisma } from "@/lib/db/prisma";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn()
}));

const mocksMerge = vi.hoisted(() => ({
  campaignRecipient: {
    findMany: vi.fn(),
    updateMany: vi.fn()
  },
  conversation: { updateMany: vi.fn() },
  message: { updateMany: vi.fn() }
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    contact: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      update: mocks.update,
      findUniqueOrThrow: mocks.findUniqueOrThrow
    }
  }
}));

describe("contacts repository", () => {
  const orgId = "org_123";
  const contactId = "contact_123";

  const defaultContact = {
    id: contactId,
    orgId,
    phone: "+15555550100",
    consentStatus: ConsentStatus.OPTED_IN,
    archivedAt: null,
    displayName: "Target Name"
  };

  const contactInclude = {
    tagLinks: { include: { tag: true } },
    listLinks: { include: { list: true } }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listContacts", () => {
    it("returns unarchived contacts for the org", async () => {
      mocks.findMany.mockResolvedValue([defaultContact]);

      const result = await listContacts(orgId, prisma as unknown as Prisma.TransactionClient);

      expect(result).toEqual([defaultContact]);
      expect(mocks.findMany).toHaveBeenCalledWith({
        where: { orgId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        include: contactInclude
      });
    });
  });

  describe("listArchivedContacts", () => {
    it("returns archived contacts for the org", async () => {
      const archivedContact = { ...defaultContact, archivedAt: new Date() };
      mocks.findMany.mockResolvedValue([archivedContact]);

      const result = await listArchivedContacts(orgId, prisma as unknown as Prisma.TransactionClient);

      expect(result).toEqual([archivedContact]);
      expect(mocks.findMany).toHaveBeenCalledWith({
        where: { orgId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        include: contactInclude
      });
    });
  });

  describe("getContact", () => {
    it("returns a specific contact by id", async () => {
      mocks.findFirst.mockResolvedValue(defaultContact);

      const result = await getContact(orgId, contactId, prisma as unknown as Prisma.TransactionClient);

      expect(result).toEqual(defaultContact);
      expect(mocks.findFirst).toHaveBeenCalledWith({
        where: { orgId, id: contactId },
        include: contactInclude
      });
    });
  });

  describe("archiveContact", () => {
    beforeEach(() => {
      mocks.transaction.mockImplementation(async (callback) =>
        callback({
          contact: {
            findFirst: mocks.findFirst,
            update: mocks.update,
            findUniqueOrThrow: mocks.findUniqueOrThrow
          },
          contactTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          contactListMember: { deleteMany: vi.fn(), createMany: vi.fn() },
          tag: { createMany: vi.fn(), findMany: vi.fn() },
          contactList: { createMany: vi.fn(), findMany: vi.fn() }
        })
      );
    });

    it("archives a contact", async () => {
      mocks.findFirst.mockResolvedValue(defaultContact);
      mocks.update.mockResolvedValue({ ...defaultContact, archivedAt: new Date() });
      mocks.findUniqueOrThrow.mockResolvedValue({ ...defaultContact, archivedAt: new Date() });

      const result = await archiveContact(orgId, contactId);

      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: contactId },
        data: expect.objectContaining({ archivedAt: expect.any(Date) })
      });
      expect(result).toBeDefined();
    });
  });

  describe("mergeContacts", () => {
    const targetContactId = "target_123";
    const sourceContactId = "source_123";
    const targetConsentCapturedAt = new Date("2026-05-01T12:00:00.000Z");

    const targetContact = {
      id: targetContactId,
      orgId,
      phone: "+15555550101",
      consentStatus: ConsentStatus.UNKNOWN,
      optInAt: null,
      optedOutAt: null,
      consentCapturedAt: targetConsentCapturedAt,
      consentMethod: "web_form",
      consentDisclosure: "I agree to receive messages at the target number.",
      notes: "Target notes",
      displayName: "Target Name",
      tagLinks: [],
      listLinks: []
    };

    const sourceContact = {
      id: sourceContactId,
      orgId,
      phone: "+15555550102",
      consentStatus: ConsentStatus.OPTED_IN,
      optInAt: new Date(),
      optedOutAt: null,
      consentCapturedAt: new Date("2026-04-01T12:00:00.000Z"),
      consentMethod: "sms_keyword",
      consentDisclosure: "Source-number consent evidence.",
      notes: "Source notes",
      displayName: "Source Name",
      tagLinks: [],
      listLinks: []
    };

    beforeEach(() => {
      mocks.transaction.mockImplementation(async (callback) =>
        callback({
          contact: {
            findFirst: mocks.findFirst,
            update: mocks.update,
            findUniqueOrThrow: mocks.findUniqueOrThrow
          },
          campaignRecipient: mocksMerge.campaignRecipient,
          conversation: mocksMerge.conversation,
          message: mocksMerge.message,
          contactTag: { deleteMany: vi.fn(), createMany: vi.fn() },
          contactListMember: { deleteMany: vi.fn(), createMany: vi.fn() },
          tag: { createMany: vi.fn(), findMany: vi.fn() },
          contactList: { createMany: vi.fn(), findMany: vi.fn() }
        })
      );

      mocksMerge.campaignRecipient.findMany.mockResolvedValue([]);
      mocksMerge.campaignRecipient.updateMany.mockResolvedValue({ count: 0 });
      mocksMerge.conversation.updateMany.mockResolvedValue({ count: 0 });
      mocksMerge.message.updateMany.mockResolvedValue({ count: 0 });
    });

    it("returns null if target and source are the same", async () => {
      const result = await mergeContacts(orgId, contactId, contactId);
      expect(result).toBeNull();
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("returns null if either target or source is not found", async () => {
      mocks.findFirst.mockResolvedValueOnce(targetContact).mockResolvedValueOnce(null);
      const result = await mergeContacts(orgId, targetContactId, sourceContactId);
      expect(result).toBeNull();
    });

    it("merges source into target successfully", async () => {
      mocks.findFirst.mockResolvedValueOnce(targetContact).mockResolvedValueOnce(sourceContact);
      mocks.findUniqueOrThrow.mockResolvedValue(targetContact);

      const result = await mergeContacts(orgId, targetContactId, sourceContactId);

      // Verify target update
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: targetContactId },
          data: expect.objectContaining({
            notes: expect.stringContaining("Merged from Source Name: Source notes"),
            consentStatus: ConsentStatus.OPTED_IN
          })
        })
      );

      // Verify source update
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sourceContactId },
          data: expect.objectContaining({
            archivedAt: expect.any(Date),
            notes: expect.stringContaining("Merged into Target Name")
          })
        })
      );

      expect(mocksMerge.conversation.updateMany).toHaveBeenCalledWith({
        where: { orgId, contactId: sourceContactId },
        data: { contactId: targetContactId }
      });
      expect(mocksMerge.message.updateMany).toHaveBeenCalledWith({
        where: { orgId, contactId: sourceContactId },
        data: { contactId: targetContactId }
      });

      expect(result).toEqual(targetContact);
    });

    it("does not transfer opted-in status when the target lacks its own complete evidence", async () => {
      const targetWithoutEvidence = {
        ...targetContact,
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      };
      mocks.findFirst.mockResolvedValueOnce(targetWithoutEvidence).mockResolvedValueOnce(sourceContact);
      mocks.findUniqueOrThrow.mockResolvedValue(targetWithoutEvidence);

      await mergeContacts(orgId, targetContactId, sourceContactId);

      const targetUpdate = mocks.update.mock.calls.find(([call]) => call.where.id === targetContactId)?.[0];
      expect(targetUpdate.data.consentStatus).toBeUndefined();
      expect(targetUpdate.data.optInAt).toBeUndefined();
    });

    it("demotes an opted-in target whose consent evidence is incomplete", async () => {
      const optedInWithoutEvidence = {
        ...targetContact,
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      };
      const unknownSource = {
        ...sourceContact,
        consentStatus: ConsentStatus.UNKNOWN
      };
      mocks.findFirst.mockResolvedValueOnce(optedInWithoutEvidence).mockResolvedValueOnce(unknownSource);
      mocks.findUniqueOrThrow.mockResolvedValue(optedInWithoutEvidence);

      await mergeContacts(orgId, targetContactId, sourceContactId);

      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: targetContactId },
          data: expect.objectContaining({
            consentStatus: ConsentStatus.UNKNOWN,
            optInAt: null,
            optedOutAt: null
          })
        })
      );
    });
  });
});
