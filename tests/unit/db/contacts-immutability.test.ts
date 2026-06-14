import { ConsentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertContact, updateContact, importContacts } from "@/lib/db/repositories/contacts";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  deleteManyTags: vi.fn(),
  deleteManyLists: vi.fn(),
  upsertTag: vi.fn(),
  upsertList: vi.fn(),
  createTag: vi.fn(),
  createList: vi.fn(),
  createImport: vi.fn(),
  updateImport: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

describe("consent evidence write-once immutability", () => {
  const orgId = "org_123";
  const contactId = "contact_123";
  const phone = "+15555550100";
  const dateStr = "2026-05-29T10:00:00.000Z";
  const date = new Date(dateStr);

  const existingWithEvidence = {
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
    notes: null
  };

  const existingWithoutEvidence = {
    id: contactId,
    orgId,
    phone,
    consentStatus: ConsentStatus.UNKNOWN,
    consentCapturedAt: null,
    consentMethod: null,
    consentDisclosure: null,
    email: null,
    firstName: null,
    lastName: null,
    displayName: null,
    optInSource: null,
    source: null,
    notes: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        contact: {
          findUnique: mocks.findUnique,
          findFirst: mocks.findFirst,
          upsert: mocks.upsert,
          update: mocks.update,
          findUniqueOrThrow: mocks.findUniqueOrThrow,
          create: mocks.create
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
        tag: {
          upsert: mocks.upsertTag
        },
        contactList: {
          upsert: mocks.upsertList
        },
        contactImport: {
          create: mocks.createImport,
          update: mocks.updateImport
        }
      })
    );

    // Setup default mock values
    mocks.deleteManyTags.mockResolvedValue({ count: 0 });
    mocks.deleteManyLists.mockResolvedValue({ count: 0 });
    mocks.createImport.mockResolvedValue({ id: "import_123" });
    mocks.updateImport.mockResolvedValue({ id: "import_123" });
  });

  describe("upsertContact", () => {
    it("allows first capture (evidence currently empty)", async () => {
      mocks.findUnique.mockResolvedValue(null);
      mocks.upsert.mockResolvedValue(existingWithEvidence);
      mocks.findUniqueOrThrow.mockResolvedValue({
        ...existingWithEvidence,
        tagLinks: [],
        listLinks: []
      });

      const input = {
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: date,
        consentMethod: "web_form",
        consentDisclosure: "I agree to terms",
        tagNames: [],
        listNames: []
      };

      const result = await upsertContact(orgId, input);
      expect(result).toBeDefined();
      expect(mocks.upsert).toHaveBeenCalled();
    });

    it("allows identical no-op writes when evidence is already set", async () => {
      mocks.findUnique.mockResolvedValue(existingWithEvidence);
      mocks.upsert.mockResolvedValue(existingWithEvidence);
      mocks.findUniqueOrThrow.mockResolvedValue({
        ...existingWithEvidence,
        tagLinks: [],
        listLinks: []
      });

      const input = {
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: date,
        consentMethod: "web_form",
        consentDisclosure: "I agree to terms",
        tagNames: [],
        listNames: []
      };

      const result = await upsertContact(orgId, input);
      expect(result).toBeDefined();
      expect(mocks.upsert).toHaveBeenCalled();
    });

    it("allows updates of unrelated fields when evidence is already set", async () => {
      mocks.findUnique.mockResolvedValue(existingWithEvidence);
      mocks.upsert.mockResolvedValue(existingWithEvidence);
      mocks.findUniqueOrThrow.mockResolvedValue({
        ...existingWithEvidence,
        tagLinks: [],
        listLinks: []
      });

      const input = {
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        firstName: "Ada",
        tagNames: [],
        listNames: []
      };

      const result = await upsertContact(orgId, input);
      expect(result).toBeDefined();
      expect(mocks.upsert).toHaveBeenCalled();
    });

    it("rejects different consentCapturedAt", async () => {
      mocks.findUnique.mockResolvedValue(existingWithEvidence);

      const input = {
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        consentCapturedAt: new Date("2026-05-30T10:00:00.000Z"),
        tagNames: [],
        listNames: []
      };

      await expect(upsertContact(orgId, input)).rejects.toThrow(
        "Consent evidence (consentCapturedAt) is write-once and cannot be changed"
      );
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("rejects different consentMethod", async () => {
      mocks.findUnique.mockResolvedValue(existingWithEvidence);

      const input = {
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        consentMethod: "verbal",
        tagNames: [],
        listNames: []
      };

      await expect(upsertContact(orgId, input)).rejects.toThrow(
        "Consent evidence (consentMethod) is write-once and cannot be changed"
      );
      expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("rejects different consentDisclosure", async () => {
      mocks.findUnique.mockResolvedValue(existingWithEvidence);

      const input = {
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        consentDisclosure: "Verbatim new text",
        tagNames: [],
        listNames: []
      };

      await expect(upsertContact(orgId, input)).rejects.toThrow(
        "Consent evidence (consentDisclosure) is write-once and cannot be changed"
      );
      expect(mocks.upsert).not.toHaveBeenCalled();
    });
  });

  describe("updateContact", () => {
    it("allows first capture on update", async () => {
      mocks.findFirst.mockResolvedValue(existingWithoutEvidence);
      mocks.update.mockResolvedValue(existingWithEvidence);
      mocks.findUniqueOrThrow.mockResolvedValue({
        ...existingWithEvidence,
        tagLinks: [],
        listLinks: []
      });

      const input = {
        consentCapturedAt: date,
        consentMethod: "web_form",
        consentDisclosure: "I agree to terms"
      };

      const result = await updateContact(orgId, contactId, input);
      expect(result).toBeDefined();
      expect(mocks.update).toHaveBeenCalled();
    });

    it("rejects changing already set evidence on update", async () => {
      mocks.findFirst.mockResolvedValue(existingWithEvidence);

      const input = {
        consentMethod: "in_person"
      };

      await expect(updateContact(orgId, contactId, input)).rejects.toThrow(
        "Consent evidence (consentMethod) is write-once and cannot be changed"
      );
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe("importContacts", () => {
    it("allows first capture on import", async () => {
      mocks.findUnique.mockResolvedValue(null);
      mocks.upsert.mockResolvedValue(existingWithEvidence);

      const parsed = {
        contacts: [
          {
            phone,
            consentStatus: ConsentStatus.OPTED_IN,
            consentCapturedAt: date,
            consentMethod: "web_form",
            consentDisclosure: "I agree to terms",
            tagNames: [],
            listNames: []
          }
        ],
        errors: [],
        totalRows: 1
      };

      const result = await importContacts(orgId, parsed);
      expect(result).toBeDefined();
      expect(mocks.upsert).toHaveBeenCalled();
    });

    it("rejects changing already set evidence on import", async () => {
      mocks.findUnique.mockResolvedValue(existingWithEvidence);

      const parsed = {
        contacts: [
          {
            phone,
            consentStatus: ConsentStatus.OPTED_IN,
            consentMethod: "import_overwrite",
            tagNames: [],
            listNames: []
          }
        ],
        errors: [],
        totalRows: 1
      };

      await expect(importContacts(orgId, parsed)).rejects.toThrow(
        "Consent evidence (consentMethod) is write-once and cannot be changed"
      );
      expect(mocks.upsert).not.toHaveBeenCalled();
    });
  });
});
