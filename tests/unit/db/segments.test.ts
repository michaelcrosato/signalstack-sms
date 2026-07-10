import { describe, expect, it, vi } from "vitest";
import { evaluateSegmentContacts } from "@/lib/db/repositories/segments";
import { type Prisma, ConsentStatus } from "@prisma/client";

function fakeTx() {
  return {
    contact: {
      findMany: vi.fn().mockResolvedValue([])
    }
  } as unknown as Prisma.TransactionClient;
}

describe("evaluateSegmentContacts", () => {
  it("queries contacts by orgId and not archived by default", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", {}, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          archivedAt: null
        }
      })
    );
  });

  it("filters by consent statuses when provided", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", { consentStatuses: [ConsentStatus.OPTED_IN] }, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org1",
          consentStatus: { in: [ConsentStatus.OPTED_IN] }
        })
      })
    );
  });

  it("filters by lead score min/max when provided", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", { minLeadScore: 10, maxLeadScore: 50 }, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadScore: { gte: 10, lte: 50 }
        })
      })
    );
  });

  it("filters by only minLeadScore", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", { minLeadScore: 25 }, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadScore: { gte: 25 }
        })
      })
    );
  });

  it("filters by only maxLeadScore", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", { maxLeadScore: 100 }, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadScore: { lte: 100 }
        })
      })
    );
  });

  it("filters by tag names when provided", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", { tagNames: ["vip", "early-adopter"] }, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tagLinks: {
            some: {
              tag: {
                name: { in: ["vip", "early-adopter"] }
              }
            }
          }
        })
      })
    );
  });

  it("combines multiple filters correctly", async () => {
    const tx = fakeTx();
    await evaluateSegmentContacts("org1", {
      consentStatuses: [ConsentStatus.OPTED_IN],
      minLeadScore: 50,
      tagNames: ["pro"]
    }, tx);

    expect(tx.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: "org1",
          archivedAt: null,
          consentStatus: { in: [ConsentStatus.OPTED_IN] },
          leadScore: { gte: 50 },
          tagLinks: {
            some: {
              tag: {
                name: { in: ["pro"] }
              }
            }
          }
        }
      })
    );
  });
});
