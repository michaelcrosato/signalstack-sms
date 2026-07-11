import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrganizationSummary } from "@/lib/db/repositories/orgs";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { organization: { findUnique: mocks.findUnique } }
}));

describe("getOrganizationSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the selected organization identity and aggregate counts", async () => {
    const organization = {
      id: "org_123",
      name: "Test Org",
      slug: "test-org",
      demoMode: false,
      timezone: "UTC",
      _count: { memberships: 5, contacts: 100, campaigns: 10, conversations: 50, messages: 500 }
    };
    mocks.findUnique.mockResolvedValue(organization);

    await expect(getOrganizationSummary(organization.id)).resolves.toEqual(organization);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: organization.id },
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
  });

  it("returns null for a missing organization", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(getOrganizationSummary("missing_org")).resolves.toBeNull();
  });
});
