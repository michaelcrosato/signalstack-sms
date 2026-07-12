import { ConsentStatus, type Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContact, updateContact } from "@/lib/db/repositories/contacts";

describe("contact public-write transaction support", () => {
  const orgId = "org_demo";
  const contactId = "contact_demo";
  const contact = {
    id: contactId,
    orgId,
    phone: "+15555550100",
    email: null,
    firstName: null,
    lastName: null,
    displayName: null,
    consentStatus: ConsentStatus.UNKNOWN,
    optInSource: null,
    optInAt: null,
    optedOutAt: null,
    consentCapturedAt: null,
    consentMethod: null,
    consentDisclosure: null,
    source: "api",
    notes: null,
    leadScore: null,
    leadStage: null,
    leadQualifiedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-07-10T01:00:00.000Z"),
    updatedAt: new Date("2026-07-10T01:00:00.000Z"),
    tagLinks: [],
    listLinks: []
  };

  const mocks = {
    contactCreate: vi.fn(),
    contactFindFirst: vi.fn(),
    contactUpdate: vi.fn(),
    contactFindUniqueOrThrow: vi.fn(),
    contactTagDeleteMany: vi.fn(),
    contactTagCreateMany: vi.fn(),
    contactListDeleteMany: vi.fn(),
    contactListCreateMany: vi.fn(),
    tagCreateMany: vi.fn(),
    tagFindMany: vi.fn(),
    listCreateMany: vi.fn(),
    listFindMany: vi.fn()
  };

  const tx = {
    contact: {
      create: mocks.contactCreate,
      findFirst: mocks.contactFindFirst,
      update: mocks.contactUpdate,
      findUniqueOrThrow: mocks.contactFindUniqueOrThrow
    },
    contactTag: { deleteMany: mocks.contactTagDeleteMany, createMany: mocks.contactTagCreateMany },
    contactListMember: { deleteMany: mocks.contactListDeleteMany, createMany: mocks.contactListCreateMany },
    tag: { createMany: mocks.tagCreateMany, findMany: mocks.tagFindMany },
    contactList: { createMany: mocks.listCreateMany, findMany: mocks.listFindMany }
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contactCreate.mockResolvedValue(contact);
    mocks.contactFindFirst.mockResolvedValue(contact);
    mocks.contactUpdate.mockResolvedValue(contact);
    mocks.contactFindUniqueOrThrow.mockResolvedValue(contact);
    mocks.tagFindMany.mockResolvedValue([]);
    mocks.listFindMany.mockResolvedValue([]);
  });

  it("creates the contact and label state through the caller's transaction", async () => {
    const result = await createContact(
      orgId,
      {
        phone: contact.phone,
        consentStatus: ConsentStatus.UNKNOWN,
        source: "api",
        tagNames: [],
        listNames: []
      },
      tx
    );

    expect(mocks.contactCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId, phone: contact.phone, consentStatus: ConsentStatus.UNKNOWN })
    });
    expect(mocks.contactTagDeleteMany).toHaveBeenCalledWith({ where: { orgId, contactId } });
    expect(mocks.contactListDeleteMany).toHaveBeenCalledWith({ where: { orgId, contactId } });
    expect(result).toBe(contact);
  });

  it("does not erase list membership when a patch changes only tags", async () => {
    await updateContact(orgId, contactId, { tagNames: ["VIP"] }, tx);

    expect(mocks.contactTagDeleteMany).toHaveBeenCalledWith({ where: { orgId, contactId } });
    expect(mocks.contactListDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tagCreateMany).toHaveBeenCalledWith({
      data: [{ orgId, name: "VIP" }],
      skipDuplicates: true
    });
  });
});
