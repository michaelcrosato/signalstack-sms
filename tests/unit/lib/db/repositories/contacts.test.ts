import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listContacts,
  listArchivedContacts,
  getContact,
  archiveContact,
  mergeContacts,
  importContacts,



} from "@/lib/db/repositories/contacts";
import { ConsentStatus, ContactImportStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteManyTags: vi.fn(),
  deleteManyLists: vi.fn(),
  upsertTag: vi.fn(),
  upsertList: vi.fn(),
  createTag: vi.fn(),
  createList: vi.fn(),
  createImport: vi.fn(),
  updateImport: vi.fn(),
  transaction: vi.fn(),
  findManyCampaigns: vi.fn(),
  updateCampaigns: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    contact: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.update,
      upsert: mocks.upsert
    }
  }
}));

describe("Contacts Repository", () => {
  const orgId = "org_123";
  const contactId = "contact_123";
  const phone = "+15555550100";
  const dateStr = "2026-05-29T10:00:00.000Z";
  const date = new Date(dateStr);

  const mockExistingContact = {
    id: contactId,
    orgId,
    phone,
    consentStatus: ConsentStatus.OPTED_IN,
    consentCapturedAt: date,
    consentMethod: "web_form",
    consentDisclosure: "I agree to terms",
    email: null,
    firstName: null,
    lastName: null,
    displayName: null,
    optInSource: null,
    source: null,
    notes: null,
    archivedAt: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        contact: {
          findMany: mocks.findMany,
          findFirst: mocks.findFirst,
          findUnique: mocks.findUnique,
          findUniqueOrThrow: mocks.findUniqueOrThrow,
          update: mocks.update,
          upsert: mocks.upsert
        },
        contactTag: {
          deleteMany: mocks.deleteManyTags,
          create: mocks.createTag,
          upsert: mocks.createTag
        },
        contactListMember: {
          deleteMany: mocks.deleteManyLists,
          create: mocks.createList,
          upsert: mocks.createList
        },
        tag: { upsert: mocks.upsertTag },
        contactList: { upsert: mocks.upsertList },
        contactImport: {
          create: mocks.createImport,
          update: mocks.updateImport
        },
        campaignRecipient: {
          findMany: mocks.findManyCampaigns,
          update: mocks.updateCampaigns
        },
        conversation: {
          updateMany: mocks.updateMany,
          findFirst: mocks.findFirst,
          create: mocks.create,
          update: mocks.update
        },
        message: {
          updateMany: mocks.updateMany,
          create: mocks.create
        }
      })
    );
  });

  describe("listContacts", () => {
    it("should list unarchived contacts", async () => {
      mocks.findMany.mockResolvedValue([{ id: contactId }]);
      const result = await listContacts(orgId);
      expect(result).toBeDefined();
      expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { orgId, archivedAt: null }
      }));
    });
  });

  describe("listArchivedContacts", () => {
    it("should list archived contacts", async () => {
      mocks.findMany.mockResolvedValue([{ id: contactId }]);
      const result = await listArchivedContacts(orgId);
      expect(result).toBeDefined();
      expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { orgId, archivedAt: { not: null } }
      }));
    });
  });

  describe("getContact", () => {
    it("should get a specific contact", async () => {
      mocks.findFirst.mockResolvedValue({ id: contactId });
      const result = await getContact(orgId, contactId);
      expect(result).toBeDefined();
      expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: contactId })
      }));
    });
  });

  describe("archiveContact", () => {
    it("should archive a contact", async () => {
      mocks.findFirst.mockResolvedValue(mockExistingContact);
      mocks.update.mockResolvedValue({ id: contactId });
      mocks.findUniqueOrThrow.mockResolvedValue({ id: contactId });


      const result = await archiveContact(orgId, contactId);

      expect(result).toBeDefined();
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: contactId },
        data: expect.objectContaining({ archivedAt: expect.any(Date) })
      }));
    });
  });

  describe("mergeContacts", () => {
    it("should merge two contacts", async () => {
      mocks.findFirst
        .mockResolvedValueOnce({
          id: "target_1",
          consentStatus: ConsentStatus.OPTED_IN,
          optInAt: new Date(),
          optedOutAt: null,
          tagLinks: [],
          listLinks: []
        })
        .mockResolvedValueOnce({
          id: "source_1",
          consentStatus: ConsentStatus.OPTED_OUT,
          optInAt: null,
          optedOutAt: new Date(),
          tagLinks: [],
          listLinks: []
        });

      mocks.findUniqueOrThrow.mockResolvedValue({
        id: "target_1",
        tagLinks: [],
        listLinks: []
      });

      mocks.findManyCampaigns.mockResolvedValue([]);
      mocks.updateCampaigns.mockResolvedValue({});
      mocks.updateMany.mockResolvedValue({});
      mocks.upsertTag.mockResolvedValue({ id: "tag_1" });
      mocks.upsertList.mockResolvedValue({ id: "list_1" });
      mocks.createTag.mockResolvedValue({});
      mocks.createList.mockResolvedValue({});

      const result = await mergeContacts(orgId, "target_1", "source_1");
      expect(result).toBeDefined();
      expect(mocks.transaction).toHaveBeenCalled();
    });

    it("should return null if target and source are the same", async () => {
      const result = await mergeContacts(orgId, "target_1", "target_1");
      expect(result).toBeNull();
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("should return null if target or source is not found", async () => {
      mocks.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "source_1" });

      const result = await mergeContacts(orgId, "target_1", "source_1");
      expect(result).toBeNull();
    });
  });

  describe("importContacts", () => {
    it("should import contacts and create import record", async () => {
      mocks.createImport.mockResolvedValue({ id: "import_1" });
      mocks.updateImport.mockResolvedValue({ id: "import_1", status: ContactImportStatus.COMPLETED });
      mocks.findUnique.mockResolvedValue(null); // No existing contact
      mocks.upsert.mockResolvedValue({
         id: "contact_1",
         phone: "+15555550100",
         consentStatus: ConsentStatus.OPTED_IN
      });
      mocks.deleteManyTags.mockResolvedValue({});
      mocks.deleteManyLists.mockResolvedValue({});

      const parsed = {
        contacts: [
          {
            phone: "+15555550100",
            consentStatus: ConsentStatus.OPTED_IN,
            tagNames: [],
            listNames: []
          }
        ],
        errors: [],
        totalRows: 1
      };

      const result = await importContacts(orgId, parsed);

      expect(result).toBeDefined();
      expect(mocks.createImport).toHaveBeenCalled();
      expect(mocks.upsert).toHaveBeenCalled();
      expect(mocks.updateImport).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ContactImportStatus.COMPLETED })
      }));
    });
  });

});
