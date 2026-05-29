import { describe, expect, it, vi } from "vitest";
import type { prisma } from "@/lib/db/prisma";
import { persistContactLeadQualification } from "@/lib/db/repositories/lead-qualification";

function fakeDb(conversation: { contactId: string } | null) {
  return {
    conversation: { findFirst: vi.fn().mockResolvedValue(conversation) },
    contact: { updateMany: vi.fn().mockResolvedValue({ count: conversation ? 1 : 0 }) }
  };
}

describe("persistContactLeadQualification (tenant-scoped)", () => {
  it("updates the contact behind the conversation, scoped to org", async () => {
    const db = fakeDb({ contactId: "c1" });
    const ok = await persistContactLeadQualification(
      "org1",
      "conv1",
      { score: 82, stage: "HOT" },
      db as unknown as typeof prisma
    );

    expect(ok).toBe(true);
    expect(db.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", orgId: "org1" },
      data: expect.objectContaining({ leadScore: 82, leadStage: "HOT" })
    });
  });

  it("returns false and writes nothing when the conversation is not in the org", async () => {
    const db = fakeDb(null);
    const ok = await persistContactLeadQualification(
      "org1",
      "missing",
      { score: 10, stage: "NURTURE" },
      db as unknown as typeof prisma
    );

    expect(ok).toBe(false);
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });
});
