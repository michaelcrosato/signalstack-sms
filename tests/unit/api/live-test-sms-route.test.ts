import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/demo/live-test-sms/route";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn(),
  requireApiRole: vi.fn(),
  getLiveTestSmsStatus: vi.fn(),
  sendLiveTestSms: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/messaging/live-test-sms", () => ({
  getLiveTestSmsStatus: mocks.getLiveTestSmsStatus,
  sendLiveTestSms: mocks.sendLiveTestSms
}));

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const operatorToken = "test-operator-token-32-characters-minimum";

function liveTestRequest() {
  return new Request("http://localhost/api/demo/live-test-sms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost", Host: "localhost" },
    body: JSON.stringify({
      requestId,
      to: "+15879873814",
      body: "Hello",
      confirmation: "SEND ONE LIVE TEST SMS",
      operatorToken
    })
  });
}

describe("POST /api/demo/live-test-sms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "org_1",
      userId: "user_1",
      role: "ADMIN"
    });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("returns only redacted readiness counts and last-four hints", async () => {
    mocks.getLiveTestSmsStatus.mockReturnValue({
      enabled: true,
      allowedRecipientCount: 1,
      allowedRecipientLast4: ["3814"],
      fromNumberConfigured: true,
      fromNumberLast4: "0199",
      blockers: []
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      liveTestSms: {
        enabled: true,
        allowedRecipientCount: 1,
        allowedRecipientLast4: ["3814"],
        fromNumberConfigured: true,
        fromNumberLast4: "0199",
        blockers: []
      }
    });
    expect(JSON.stringify(payload)).not.toContain("+15879873814");
    expect(JSON.stringify(payload)).not.toContain("+15555550199");
    expect(JSON.stringify(payload)).not.toContain(operatorToken);
  });

  it.each([
    [201, { sent: true, duplicate: false }],
    [200, { sent: true, duplicate: true }],
    [409, { sent: false, duplicate: true, conflict: true }],
    [202, { sent: false, duplicate: true, pending: true }],
    [502, { sent: false, duplicate: true, failed: true }],
    [403, { sent: false, blockers: ["LIVE_TEST_SMS_DISABLED"] }]
  ])("maps a stored send outcome to HTTP %i", async (expectedStatus, result) => {
    mocks.sendLiveTestSms.mockResolvedValue(result);

    const response = await POST(liveTestRequest());

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject(result);
    expect(mocks.sendLiveTestSms).toHaveBeenCalledWith({
      orgId: "org_1",
      actorUserId: "user_1",
      requestId,
      to: "+15879873814",
      body: "Hello",
      confirmation: "SEND ONE LIVE TEST SMS",
      operatorToken
    });
  });

  it("does not expose unexpected persistence errors", async () => {
    mocks.sendLiveTestSms.mockRejectedValue(new Error("database credentials leaked"));

    const response = await POST(liveTestRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Live test SMS failed." });
  });
});
