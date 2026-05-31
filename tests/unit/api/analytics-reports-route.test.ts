import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/analytics/reports/route";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn(),
  requireApiRole: vi.fn(),
  contactFindMany: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contact: { findMany: mocks.contactFindMany }
  }
}));

describe("POST /api/analytics/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_1", role: "ADMIN" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("returns 400 for invalid actions", async () => {
    const req = new Request("http://localhost/api/analytics/reports", {
      method: "POST",
      body: JSON.stringify({ action: "invalid" })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid reporting action specified." });
  });

  it("returns a mock success for save action", async () => {
    const req = new Request("http://localhost/api/analytics/reports", {
      method: "POST",
      body: JSON.stringify({ action: "save" })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  });

  it("exports a CSV correctly for export action", async () => {
    mocks.contactFindMany.mockResolvedValue([
      { id: "c_1", phone: "+15555555555", consentStatus: "OPTED_IN", createdAt: new Date("2026-01-01T00:00:00.000Z") }
    ]);

    const req = new Request("http://localhost/api/analytics/reports", {
      method: "POST",
      body: JSON.stringify({ action: "export" })
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");

    const text = await res.text();
    expect(text).toContain("id,phone,consentStatus,createdAt");
    expect(text).toContain('"c_1","+15555555555","OPTED_IN","2026-01-01T00:00:00.000Z"');
  });

  it("enforces a 5000ms timeout on export", async () => {
    // Mock findMany to take 6000ms (longer than the 5000ms timeout)
    mocks.contactFindMany.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 6000));
      return [];
    });
    vi.useFakeTimers();

    const req = new Request("http://localhost/api/analytics/reports", {
      method: "POST",
      body: JSON.stringify({ action: "export" })
    });

    // We execute the POST request without awaiting it initially, so we can fast-forward time
    const resPromise = POST(req);

    // Fast-forward past the 5-second timeout
    await vi.advanceTimersByTimeAsync(5100);

    const res = await resPromise;
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Report generation timed out" });

    vi.useRealTimers();
  });
});
