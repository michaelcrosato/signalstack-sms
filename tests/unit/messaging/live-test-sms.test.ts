import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveTestSmsStatus,
  liveTestSmsConfirmation,
  normalizeNorthAmericanPhone,
  parseLiveTestSmsAllowlist,
  sendLiveTestSms
} from "@/lib/messaging/live-test-sms";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

const mocks = vi.hoisted(() => ({
  messageCreate: vi.fn(),
  readinessAuditCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: {
      create: mocks.messageCreate
    },
    liveReadinessAuditEvent: {
      create: mocks.readinessAuditCreate
    }
  }
}));

describe("live test SMS gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.messageCreate.mockResolvedValue({ id: "message_live_test" });
    mocks.readinessAuditCreate.mockResolvedValue({ id: "audit_live_test" });
    mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
  });

  it("normalizes North American demo phone formats to E.164", () => {
    expect(normalizeNorthAmericanPhone("1.587.987.3814")).toBe("+15879873814");
    expect(normalizeNorthAmericanPhone("(587) 987-3814")).toBe("+15879873814");
    expect(normalizeNorthAmericanPhone("+15879873814")).toBe("+15879873814");
  });

  it("stays blocked by default", () => {
    const status = getLiveTestSmsStatus({});

    expect(status.enabled).toBe(false);
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        "LIVE_TEST_SMS_DISABLED",
        "LIVE_MESSAGING_DISABLED",
        "TWILIO_PROVIDER_NOT_SELECTED",
        "TWILIO_ENV_CREDENTIALS_INCOMPLETE",
        "LIVE_TEST_SMS_ALLOWLIST_EMPTY"
      ])
    );
  });

  it("enables only with explicit live Twilio settings and allowlisted recipients", () => {
    const status = getLiveTestSmsStatus({
      LIVE_TEST_SMS_ENABLED: "true",
      LIVE_MESSAGING_ENABLED: "true",
      MESSAGING_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC_test",
      TWILIO_AUTH_TOKEN: "secret",
      TWILIO_FROM_NUMBER: "+15555550199",
      LIVE_TEST_SMS_TO_ALLOWLIST: "1.587.987.3814"
    });

    expect(status).toMatchObject({
      enabled: true,
      allowedRecipients: ["+15879873814"],
      fromNumber: "+15555550199",
      blockers: []
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("filters invalid allowlist entries", () => {
    expect(parseLiveTestSmsAllowlist({ LIVE_TEST_SMS_TO_ALLOWLIST: "nope,+15879873814" })).toEqual([
      "+15879873814"
    ]);
  });

  it("accepts live-test payload shape before gate evaluation", () => {
    expect(
      liveTestSmsSchema.safeParse({
        to: "+15879873814",
        body: "Hello",
        confirmation: liveTestSmsConfirmation
      }).success
    ).toBe(true);
    expect(
      liveTestSmsSchema.safeParse({
        to: "+15879873814",
        body: "Hello",
        confirmation: "send"
      }).success
    ).toBe(true);
  });

  it("blocks sends when the exact confirmation phrase is missing", async () => {
    await expect(
      sendLiveTestSms({
        orgId: "org_1",
        actorUserId: "user_1",
        to: "+15879873814",
        body: "Hello",
        confirmation: "send",
        env: {}
      })
    ).resolves.toMatchObject({
      sent: false,
      blockers: expect.arrayContaining(["LIVE_TEST_CONFIRMATION_MISMATCH"])
    });
  });

  it("normalizes accepted Twilio response statuses before local audit and message storage", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
      json: async () => ({
        sid: "SM_live_test",
        status: " ACCEPTED "
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendLiveTestSms({
        orgId: "org_1",
        actorUserId: "user_1",
        to: "1.587.987.3814",
        body: "Hello from the gated local test path",
        confirmation: liveTestSmsConfirmation,
        env: {
          LIVE_TEST_SMS_ENABLED: "true",
          LIVE_MESSAGING_ENABLED: "true",
          MESSAGING_PROVIDER: "twilio",
          TWILIO_ACCOUNT_SID: "AC_test",
          TWILIO_AUTH_TOKEN: "secret",
          TWILIO_FROM_NUMBER: "+15555550199",
          LIVE_TEST_SMS_TO_ALLOWLIST: "+15879873814"
        }
      })
    ).resolves.toMatchObject({
      sent: true,
      providerMessageId: "SM_live_test",
      providerStatus: "accepted",
      toLast4: "3814",
      fromLast4: "0199",
      blockers: []
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_1",
        direction: "OUTBOUND",
        body: "Hello from the gated local test path",
        providerMessageId: "SM_live_test",
        providerStatus: "accepted"
      })
    });
    expect(mocks.readinessAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org_1",
        actorUserId: "user_1",
        action: "LIVE_TEST_SMS_SENT",
        metadata: expect.objectContaining({
          provider: "twilio",
          providerStatus: "accepted",
          toLast4: "3814",
          fromLast4: "0199"
        })
      })
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
