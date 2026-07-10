import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  listContacts,
  listArchivedContacts,
  getContact,
  upsertContact,
  updateContact,
  archiveContact,
  mergeContacts
} from "@/lib/db/repositories/contacts";
import { orgWhere } from "@/lib/db/tenant";
import { ConsentStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  deleteManyTags: vi.fn(),
  deleteManyLists: vi.fn(),
  upsertTag: vi.fn(),
  upsertList: vi.fn(),
  createTag: vi.fn(),
  createList: vi.fn(),
  createTagMember: vi.fn(),
  createListMember: vi.fn(),
  upsertTagMember: vi.fn(),
  upsertListMember: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    contact: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      update: mocks.update,
      findUniqueOrThrow: mocks.findUniqueOrThrow
    }
  }
}));

describe("contacts repository", () => {
  const orgId = "org_1";
  const contactId = "contact_1";
  const tx = {
    contact: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      update: mocks.update,
      findUniqueOrThrow: mocks.findUniqueOrThrow
    },
    contactTag: {
      deleteMany: mocks.deleteManyTags,
      create: mocks.createTagMember,
      upsert: mocks.upsertTagMember
    },
    contactListMember: {
      deleteMany: mocks.deleteManyLists,
      create: mocks.createListMember,
      upsert: mocks.upsertListMember
    },
    tag: {
      upsert: mocks.upsertTag
    },
    contactList: {
      upsert: mocks.upsertList
    },
    campaignRecipient: {
      findMany: mocks.findMany,
      update: mocks.update
    },
    conversation: {
      updateMany: mocks.updateMany
    },
    message: {
      updateMany: mocks.updateMany
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((cb) => cb(tx));
  });

  describe("listContacts", () => {
    it("returns unarchived contacts", async () => {
      const contacts = [{ id: "1" }];
      mocks.findMany.mockResolvedValue(contacts);
      const result = await listContacts(orgId, tx as unknown as Parameters<typeof listContacts>[1]);
      expect(result).toEqual(contacts);
      expect(mocks.findMany).toHaveBeenCalledWith({
        where: { orgId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        include: expect.any(Object)
      });
    });
  });

  describe("listArchivedContacts", () => {
    it("returns archived contacts", async () => {
      const contacts = [{ id: "1" }];
      mocks.findMany.mockResolvedValue(contacts);
      const result = await listArchivedContacts(orgId, tx as unknown as Parameters<typeof listContacts>[1]);
      expect(result).toEqual(contacts);
      expect(mocks.findMany).toHaveBeenCalledWith({
        where: { orgId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        include: expect.any(Object)
      });
    });
  });

  describe("getContact", () => {
    it("returns a specific contact", async () => {
      const contact = { id: contactId };
      mocks.findFirst.mockResolvedValue(contact);
      const result = await getContact(orgId, contactId, tx as unknown as Parameters<typeof listContacts>[1]);
      expect(result).toEqual(contact);
      expect(mocks.findFirst).toHaveBeenCalledWith({
        where: orgWhere(orgId, { id: contactId }),
        include: expect.any(Object)
      });
    });
  });

  describe("upsertContact", () => {
    it("upserts and returns contact", async () => {
      const input = { phone: "+1234567890", consentStatus: ConsentStatus.OPTED_IN, tagNames: [], listNames: [] };
      mocks.findUnique.mockResolvedValue(null);
      mocks.upsert.mockResolvedValue({ id: "new_contact", consentStatus: ConsentStatus.OPTED_IN });
      mocks.findUniqueOrThrow.mockResolvedValue({ id: "new_contact" });

      const result = await upsertContact(orgId, input);

      expect(result).toEqual({ id: "new_contact" });
      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId_phone: { orgId, phone: input.phone } },
        update: expect.any(Object),
        create: expect.any(Object)
      });
    });
  });

  describe("updateContact", () => {
    it("updates and returns contact", async () => {
      const input = { firstName: "John" };
      mocks.findFirst.mockResolvedValue({ id: contactId });
      mocks.update.mockResolvedValue({ id: contactId });
      mocks.findUniqueOrThrow.mockResolvedValue({ id: contactId, firstName: "John" });

      const result = await updateContact(orgId, contactId, input);

      expect(result).toEqual({ id: contactId, firstName: "John" });
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: contactId },
        data: expect.objectContaining({ firstName: "John" })
      });
    });

    it("returns null if contact not found", async () => {
      mocks.findFirst.mockResolvedValue(null);
      const result = await updateContact(orgId, contactId, {});
      expect(result).toBeNull();
    });
  });

  describe("archiveContact", () => {
    it("archives a contact", async () => {
      mocks.findFirst.mockResolvedValue({ id: contactId });
      mocks.update.mockResolvedValue({ id: contactId });
      mocks.findUniqueOrThrow.mockResolvedValue({ id: contactId, archivedAt: new Date() });

      const result = await archiveContact(orgId, contactId);

      expect(result).toHaveProperty("archivedAt");
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: contactId },
        data: expect.objectContaining({ archivedAt: expect.any(Date) })
      });
    });
  });

  describe("mergeContacts", () => {
    it("returns null if target and source are same", async () => {
      const result = await mergeContacts(orgId, contactId, contactId);
      expect(result).toBeNull();
    });

    it("returns null if one of contacts is not found", async () => {
      mocks.findFirst.mockResolvedValueOnce({ id: contactId });
      mocks.findFirst.mockResolvedValueOnce(null);

      const result = await mergeContacts(orgId, contactId, "source_2");
      expect(result).toBeNull();
    });

    it("merges source into target", async () => {
      const target = {
        id: "target_id",
        phone: "+1",
        tagLinks: [],
        listLinks: [],
        consentStatus: ConsentStatus.OPTED_IN
      };
      const source = {
        id: "source_id",
        phone: "+2",
        notes: "source note",
        tagLinks: [],
        listLinks: [],
        consentStatus: ConsentStatus.UNKNOWN
      };

      mocks.findFirst.mockResolvedValueOnce(target);
      mocks.findFirst.mockResolvedValueOnce(source);
      mocks.findMany.mockResolvedValue([]);
      mocks.findUniqueOrThrow.mockResolvedValue({ ...target, notes: "source note" });

      const result = await mergeContacts(orgId, "target_id", "source_id");
      expect(result).toBeDefined();
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "target_id" },
        data: expect.objectContaining({ notes: "source note" })
      }));
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "source_id" }
      }));
    });
  });
});
