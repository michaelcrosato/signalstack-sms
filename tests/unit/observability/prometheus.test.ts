import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/metrics/route";
import { prisma } from "@/lib/db/prisma";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

describe("Prometheus Metrics Exporter API", () => {
  const originalEnv = process.env.OBSERVABILITY_ENABLED;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.OBSERVABILITY_ENABLED = originalEnv;
  });

  it("returns 404 when OBSERVABILITY_ENABLED is false or unset", async () => {
    process.env.OBSERVABILITY_ENABLED = "false";
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("returns Prometheus exposition plaintext with correct headers when OBSERVABILITY_ENABLED is true", async () => {
    process.env.OBSERVABILITY_ENABLED = "true";

    // Set up two organizations so the scrape can prove tenant isolation.
    const org = await prisma.organization.create({
      data: { slug: `org-metrics-${Date.now()}`, name: "Metrics Org", demoMode: true }
    });
    const otherOrg = await prisma.organization.create({
      data: { slug: `org-metrics-other-${Date.now()}`, name: "Other Metrics Org", demoMode: true }
    });
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: org.id,
      userId: "metrics_user",
      role: "OWNER"
    });

    const contact = await prisma.contact.create({
      data: { orgId: org.id, phone: `+1555090${Math.floor(1000 + Math.random() * 9000)}` }
    });
    const otherContact = await prisma.contact.create({
      data: { orgId: otherOrg.id, phone: `+1555080${Math.floor(1000 + Math.random() * 9000)}` }
    });

    // Create outbound messages with different statuses
    await prisma.message.createMany({
      data: [
        {
          orgId: org.id,
          contactId: contact.id,
          direction: "OUTBOUND",
          body: "Hello 1",
          providerStatus: "delivered",
          idempotencyKey: `m1-${Date.now()}`,
          deliveredAt: new Date(Date.now()),
          createdAt: new Date(Date.now() - 3000) // 3 seconds latency
        },
        {
          orgId: org.id,
          contactId: contact.id,
          direction: "OUTBOUND",
          body: "Hello 2",
          providerStatus: "failed",
          idempotencyKey: `m2-${Date.now()}`,
          failedAt: new Date()
        },
        {
          orgId: org.id,
          contactId: contact.id,
          direction: "OUTBOUND",
          body: "Hello 3",
          providerStatus: "queued",
          idempotencyKey: `m3-${Date.now()}`
        },
        {
          orgId: org.id,
          contactId: contact.id,
          direction: "OUTBOUND",
          body: "Hello 4",
          providerStatus: "canceled",
          idempotencyKey: `m4-${Date.now()}`,
          failedAt: new Date()
        },
        {
          orgId: otherOrg.id,
          contactId: otherContact.id,
          direction: "OUTBOUND",
          body: "Other tenant failure",
          providerStatus: "failed",
          idempotencyKey: `other-m1-${Date.now()}`,
          failedAt: new Date()
        }
      ]
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; version=0.0.4; charset=utf-8");

    const text = await response.text();
    expect(text).toContain("signalstack_sms_delivery_rate_total");
    expect(text).toContain('status="delivered"}');
    expect(text).toContain('status="failed"}');
    expect(text).toContain('status="queued"}');
    expect(text).toContain('status="delivered"} 1');
    expect(text).toContain('status="failed"} 2');
    expect(text).toContain('status="queued"} 1');

    expect(text).toContain("signalstack_sms_send_latency_seconds_bucket");
    expect(text).toContain('le="5"}');
    expect(text).toContain("signalstack_sms_send_latency_seconds_sum");
    expect(text).toContain("signalstack_sms_send_latency_seconds_count");

    expect(text).toContain("signalstack_sms_queue_depth");
    expect(text).not.toContain("signalstack_sms_webhook_failures_total");
    expect(mocks.getOrCreateCurrentOrg).toHaveBeenCalledTimes(1);
  });
});
