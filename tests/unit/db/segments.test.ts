import { describe, expect, it, vi } from "vitest";
import { ConsentStatus, type Prisma } from "@prisma/client";
import { evaluateSegmentContacts } from "@/lib/db/repositories/segments";

function fakeDb() {
  return {
    contact: {
      findMany: vi.fn().mockResolvedValue([{ id: "contact-1" }]),
    },
  };
}

describe("evaluateSegmentContacts", () => {
  it("compiles a Prisma query with an empty filter", async () => {
    const db = fakeDb();
    const result = await evaluateSegmentContacts(
      "org-1",
      {},
      db as unknown as Prisma.TransactionClient
    );

    expect(result).toEqual([{ id: "contact-1" }]);
    expect(db.contact.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        archivedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        tagLinks: { include: { tag: true } },
        listLinks: { include: { list: true } },
      },
    });
  });

  it("compiles a Prisma query with consent statuses filter", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts(
      "org-1",
      { consentStatuses: [ConsentStatus.OPTED_IN] },
      db as unknown as Prisma.TransactionClient
    );

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consentStatus: { in: ["OPTED_IN"] },
        }),
      })
    );
  });

  it("compiles a Prisma query with min and max lead score filter", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts(
      "org-1",
      { minLeadScore: 10, maxLeadScore: 90 },
      db as unknown as Prisma.TransactionClient
    );

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadScore: { gte: 10, lte: 90 },
        }),
      })
    );
  });

  it("compiles a Prisma query with only min lead score filter", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts(
      "org-1",
      { minLeadScore: 50 },
      db as unknown as Prisma.TransactionClient
    );

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadScore: { gte: 50 },
        }),
      })
    );
  });

  it("compiles a Prisma query with only max lead score filter", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts(
      "org-1",
      { maxLeadScore: 100 },
      db as unknown as Prisma.TransactionClient
    );

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadScore: { lte: 100 },
        }),
      })
    );
  });

  it("compiles a Prisma query with tag names filter", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts(
      "org-1",
      { tagNames: ["VIP", "Newsletter"] },
      db as unknown as Prisma.TransactionClient
    );

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tagLinks: {
            some: {
              tag: {
                name: { in: ["VIP", "Newsletter"] },
              },
            },
          },
        }),
      })
    );
  });

  it("compiles a Prisma query with multiple filters combined", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts(
      "org-1",
      {
        consentStatuses: [ConsentStatus.OPTED_IN],
        minLeadScore: 80,
        tagNames: ["Active"],
      },
      db as unknown as Prisma.TransactionClient
    );

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-1",
          archivedAt: null,
          consentStatus: { in: ["OPTED_IN"] },
          leadScore: { gte: 80 },
          tagLinks: {
            some: {
              tag: {
                name: { in: ["Active"] },
              },
            },
          },
        }),
      })
    );
  });
});
