import { describe, expect, it, vi, beforeEach } from "vitest";
import { getOrganizationSummary } from "@/lib/db/repositories/orgs";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: mocks.findUnique
    }
  }
}));

describe("getOrganizationSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns organization summary with aggregated counts", async () => {
    const orgId = "org_123";
    const mockOrg = {
      id: orgId,
      name: "Test Org",
      slug: "test-org",
      demoMode: false,
      timezone: "UTC",
      _count: {
        memberships: 5,
        contacts: 100,
        campaigns: 10,
        conversations: 50,
        messages: 500
      }
    };

    mocks.findUnique.mockResolvedValue(mockOrg);

    const result = await getOrganizationSummary(orgId);

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: orgId },
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

  it("returns null if organization is not found", async () => {
    const orgId = "missing_org";
    mocks.findUnique.mockResolvedValue(null);

    const result = await getOrganizationSummary(orgId);

    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: orgId } })
    );
    expect(result).toBeNull();
  });
});
