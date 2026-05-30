import { ConsentStatus } from "@prisma/client";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { evaluateSegmentContacts } from "@/lib/db/repositories/segments";
import { GET as getSegments } from "@/app/api/contacts/segments/route";
import { GET as exportSegments } from "@/app/api/contacts/segments/export/route";
import { prisma } from "@/lib/db/prisma";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

describe("Automated Contact Segment Synchronization Seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evaluates tag, consent, and lead score filters dynamically", async () => {
    const org = await prisma.organization.create({
      data: { slug: `org-seg-${Date.now()}`, name: "Segment Org", demoMode: true }
    });

    const tag = await prisma.tag.create({
      data: { orgId: org.id, name: "VIP" }
    });

    const c1 = await prisma.contact.create({
      data: {
        orgId: org.id,
        phone: `+1555900${Math.floor(1000 + Math.random() * 9000)}`,
        consentStatus: ConsentStatus.OPTED_IN,
        leadScore: 90,
        tagLinks: { create: { tagId: tag.id, orgId: org.id } }
      }
    });

    const c2 = await prisma.contact.create({
      data: {
        orgId: org.id,
        phone: `+1555900${Math.floor(1000 + Math.random() * 9000)}`,
        consentStatus: ConsentStatus.PENDING_DOUBLE_OPT_IN,
        leadScore: 50
      }
    });

    const tagMatches = await evaluateSegmentContacts(org.id, { tagNames: ["VIP"] });
    expect(tagMatches.length).toBe(1);
    expect(tagMatches[0].id).toBe(c1.id);

    const consentMatches = await evaluateSegmentContacts(org.id, {
      consentStatuses: ["PENDING_DOUBLE_OPT_IN"]
    });
    expect(consentMatches.length).toBe(1);
    expect(consentMatches[0].id).toBe(c2.id);

    const scoreMatches = await evaluateSegmentContacts(org.id, {
      minLeadScore: 80
    });
    expect(scoreMatches.length).toBe(1);
    expect(scoreMatches[0].id).toBe(c1.id);
  });

  it("exposes dynamic queries and CSV exporter routes", async () => {
    const org = await prisma.organization.create({
      data: { slug: `org-seg-route-${Date.now()}`, name: "Segment Route Org", demoMode: true }
    });

    const phone = `+1555910${Math.floor(1000 + Math.random() * 9000)}`;
    await prisma.contact.create({
      data: {
        orgId: org.id,
        phone,
        consentStatus: ConsentStatus.OPTED_IN,
        leadScore: 95
      }
    });

    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: org.id,
      slug: org.slug,
      name: org.name
    });

    const request = new Request(`http://localhost/api/contacts/segments?minLeadScore=90`);
    const response = await getSegments(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.contacts.length).toBeGreaterThanOrEqual(1);
    expect(json.contacts.find((c: { phone: string }) => c.phone === phone)).toBeDefined();

    const exportResponse = await exportSegments(request);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const csv = await exportResponse.text();
    expect(csv).toContain("Phone,Email,FirstName,LastName,DisplayName,ConsentStatus,LeadScore,Tags,Lists");
    expect(csv).toContain(phone);
  });
});
