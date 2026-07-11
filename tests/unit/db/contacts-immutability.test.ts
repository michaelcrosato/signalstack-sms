import { ConsentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertContact, updateContact, importContacts } from "@/lib/db/repositories/contacts";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  deleteManyTags: vi.fn(),
  deleteManyLists: vi.fn(),
  createManyTags: vi.fn(),
  findManyTags: vi.fn(),
  createManyTagLinks: vi.fn(),
  createManyLists: vi.fn(),
  findManyLists: vi.fn(),
  createManyListLinks: vi.fn(),
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
          findMany: mocks.findMany,
          findFirst: mocks.findFirst,
          upsert: mocks.upsert,
          update: mocks.update,
          findUniqueOrThrow: mocks.findUniqueOrThrow,
          create: mocks.create
        },
        contactTag: {
          deleteMany: mocks.deleteManyTags,
          createMany: mocks.createManyTagLinks
        },
        contactListMember: {
          deleteMany: mocks.deleteManyLists,
          createMany: mocks.createManyListLinks
        },
        tag: {
          createMany: mocks.createManyTags,
          findMany: mocks.findManyTags
        },
        contactList: {
          createMany: mocks.createManyLists,
          findMany: mocks.findManyLists
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

  afterEach(() => {
    vi.unstubAllEnvs();
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

    it("rejects a partial first-capture bundle before writing", async () => {
      mocks.findUnique.mockResolvedValue(null);

      await expect(
        upsertContact(orgId, {
          phone,
          consentStatus: ConsentStatus.OPTED_IN,
          consentMethod: "web_form",
          tagNames: [],
          listNames: []
        })
      ).rejects.toThrow("Consent evidence requires capturedAt, method, and disclosure together");

      expect(mocks.upsert).not.toHaveBeenCalled();
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

    it("rejects a partial first-capture bundle before writing", async () => {
      mocks.findFirst.mockResolvedValue(existingWithoutEvidence);

      await expect(updateContact(orgId, contactId, { consentDisclosure: "I agree to terms" })).rejects.toThrow(
        "Consent evidence requires capturedAt, method, and disclosure together"
      );

      expect(mocks.update).not.toHaveBeenCalled();
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

    it("rejects clearing an existing consent timestamp with null", async () => {
      mocks.findFirst.mockResolvedValue(existingWithEvidence);

      await expect(updateContact(orgId, contactId, { consentCapturedAt: null })).rejects.toThrow(
        "Consent evidence (consentCapturedAt) is write-once and cannot be changed"
      );
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it.each([null, ""])("rejects clearing an existing consent method with %j", async (consentMethod) => {
      mocks.findFirst.mockResolvedValue(existingWithEvidence);

      await expect(updateContact(orgId, contactId, { consentMethod })).rejects.toThrow(
        "Consent evidence (consentMethod) is write-once and cannot be changed"
      );
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it.each([null, ""])(
      "rejects clearing an existing consent disclosure with %j",
      async (consentDisclosure) => {
        mocks.findFirst.mockResolvedValue(existingWithEvidence);

        await expect(updateContact(orgId, contactId, { consentDisclosure })).rejects.toThrow(
          "Consent evidence (consentDisclosure) is write-once and cannot be changed"
        );
        expect(mocks.update).not.toHaveBeenCalled();
      }
    );

    it("does not force pending double opt-in on an unrelated partial update", async () => {
      vi.stubEnv("DOUBLE_OPT_IN_REQUIRED", "true");
      mocks.findFirst.mockResolvedValue(existingWithEvidence);
      mocks.update.mockResolvedValue({ ...existingWithEvidence, firstName: "Ada" });
      mocks.findUniqueOrThrow.mockResolvedValue({
        ...existingWithEvidence,
        firstName: "Ada",
        tagLinks: [],
        listLinks: []
      });

      await updateContact(orgId, contactId, { firstName: "Ada" });

      const updateData = mocks.update.mock.calls[0][0].data;
      expect(updateData.consentStatus).toBeUndefined();
      expect(updateData.optInAt).toBeUndefined();
      expect(updateData.optedOutAt).toBeUndefined();
    });

    it("propagates null values for cleared contact fields to Prisma update", async () => {
      mocks.findFirst.mockResolvedValue(existingWithoutEvidence);
      mocks.update.mockResolvedValue({
        ...existingWithoutEvidence,
        firstName: null,
        lastName: null,
        displayName: null,
        notes: null
      });
      mocks.findUniqueOrThrow.mockResolvedValue({
        ...existingWithoutEvidence,
        firstName: null,
        lastName: null,
        displayName: null,
        notes: null,
        tagLinks: [],
        listLinks: []
      });

      const input = {
        firstName: null,
        lastName: null,
        displayName: null,
        notes: null
      };

      const result = await updateContact(orgId, contactId, input);
      expect(result).toBeDefined();
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: null,
            lastName: null,
            displayName: null,
            notes: null
          })
        })
      );
    });
  });


  describe("importContacts", () => {
    it("allows first capture on import", async () => {
      mocks.findMany.mockResolvedValue([]);
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
      mocks.findMany.mockResolvedValue([existingWithEvidence]);

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

    it("rechecks duplicate phone rows against the contact saved earlier in the same import", async () => {
      mocks.findMany.mockResolvedValue([]);
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
          },
          {
            phone,
            consentStatus: ConsentStatus.OPTED_IN,
            consentMethod: "import_overwrite",
            tagNames: [],
            listNames: []
          }
        ],
        errors: [],
        totalRows: 2
      };

      await expect(importContacts(orgId, parsed)).rejects.toThrow(
        "Consent evidence (consentMethod) is write-once and cannot be changed"
      );
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
    });

    it("chunks large existing-contact preloads below PostgreSQL bind limits", async () => {
      const contacts = Array.from({ length: 32_768 }, (_, index) => ({
        phone: `+1${String(index).padStart(10, "0")}`,
        consentStatus: ConsentStatus.UNKNOWN,
        tagNames: [],
        listNames: []
      }));
      mocks.findMany.mockResolvedValue([]);
      mocks.upsert.mockRejectedValueOnce(new Error("stop after preload"));

      await expect(
        importContacts(orgId, { contacts, errors: [], totalRows: contacts.length })
      ).rejects.toThrow("stop after preload");

      expect(mocks.findMany).toHaveBeenCalledTimes(4);
      for (const [call] of mocks.findMany.mock.calls) {
        expect(call.where.orgId).toBe(orgId);
        expect(call.where.phone.in.length).toBeLessThanOrEqual(10_000);
      }
    });
  });
});
