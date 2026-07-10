import { describe, expect, it, vi } from "vitest";
import { getOrganizationSummary } from "@/lib/db/repositories/orgs";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    }
  }
}));

describe("getOrganizationSummary", () => {
  it("queries the organization by id with correct select fields", async () => {
    const mockOrg = {
      id: "org1",
      name: "Org 1",
      slug: "org-1",
      demoMode: false,
      timezone: "UTC",
      _count: {
        memberships: 1,
        contacts: 2,
        campaigns: 3,
        conversations: 4,
        messages: 5
      }
    };

    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as unknown as null);

    const result = await getOrganizationSummary("org1");

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org1" },
      select: {
        id: true,
        name: true,
        slug: true,
        demoMode: true,
        timezone: true,
        _count: {
          select: {
            memberships: true,
            contacts: true,
            campaigns: true,
            conversations: true,
            messages: true
          }
        }
      }
    });

    expect(result).toEqual(mockOrg);
  });

  it("returns null if organization not found", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

    const result = await getOrganizationSummary("missing-org");

    expect(result).toBeNull();
  });
});
