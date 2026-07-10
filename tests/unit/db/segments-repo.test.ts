import { describe, expect, it, vi } from "vitest";
import { evaluateSegmentContacts } from "@/lib/db/repositories/segments";
import { type Prisma, ConsentStatus } from "@prisma/client";

function fakeDb(contacts: unknown[] = []) {
  return {
    contact: {
      findMany: vi.fn().mockResolvedValue(contacts)
    }
  };
}

describe("evaluateSegmentContacts", () => {
  it("queries contacts for given orgId and default filters", async () => {
    const db = fakeDb([{ id: "c1" }]);
    const result = await evaluateSegmentContacts("org1", {}, db as unknown as Prisma.TransactionClient);

    expect(result).toHaveLength(1);
    expect(db.contact.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org1",
        archivedAt: null
      },
      orderBy: { updatedAt: "desc" },
      include: {
        tagLinks: { include: { tag: true } },
        listLinks: { include: { list: true } }
      }
    });
  });

  it("adds consentStatuses to the where clause", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts("org1", { consentStatuses: [ConsentStatus.OPTED_IN, ConsentStatus.PENDING_DOUBLE_OPT_IN] }, db as unknown as Prisma.TransactionClient);

    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orgId: "org1",
        archivedAt: null,
        consentStatus: { in: [ConsentStatus.OPTED_IN, ConsentStatus.PENDING_DOUBLE_OPT_IN] }
      })
    }));
  });

  it("adds minLeadScore and maxLeadScore to the where clause", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts("org1", { minLeadScore: 50, maxLeadScore: 100 }, db as unknown as Prisma.TransactionClient);

    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orgId: "org1",
        archivedAt: null,
        leadScore: { gte: 50, lte: 100 }
      })
    }));
  });

  it("handles only minLeadScore", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts("org1", { minLeadScore: 50 }, db as unknown as Prisma.TransactionClient);

    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orgId: "org1",
        archivedAt: null,
        leadScore: { gte: 50 }
      })
    }));
  });

  it("adds tagNames to the where clause", async () => {
    const db = fakeDb();
    await evaluateSegmentContacts("org1", { tagNames: ["VIP", "Active"] }, db as unknown as Prisma.TransactionClient);

    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orgId: "org1",
        archivedAt: null,
        tagLinks: {
          some: {
            tag: {
              name: { in: ["VIP", "Active"] }
            }
          }
        }
      })
    }));
  });
});
