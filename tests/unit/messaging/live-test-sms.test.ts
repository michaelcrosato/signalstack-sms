import { describe, expect, it } from "vitest";
import {
  getLiveTestSmsStatus,
  liveTestSmsConfirmation,
  normalizeNorthAmericanPhone,
  parseLiveTestSmsAllowlist,
  sendLiveTestSms
} from "@/lib/messaging/live-test-sms";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

describe("live test SMS gates", () => {
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
});
