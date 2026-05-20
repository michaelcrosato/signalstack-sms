import { describe, expect, it } from "vitest";
import { campaignMessageValues, localWorkerProviderIsAllowed } from "@/lib/queue/worker";

describe("local queue worker", () => {
  it("only allows dummy provider processing while live messaging is disabled", () => {
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "false", messagingProvider: "dummy" })).toBe(true);
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "true", messagingProvider: "dummy" })).toBe(false);
    expect(localWorkerProviderIsAllowed({ liveMessagingEnabled: "false", messagingProvider: "twilio" })).toBe(false);
  });

  it("builds campaign template values without leaking nulls", () => {
    expect(
      campaignMessageValues({
        phone: "+15555550100",
        email: null,
        firstName: "Ada",
        lastName: null,
        displayName: null
      })
    ).toEqual({
      phone: "+15555550100",
      email: "",
      firstName: "Ada",
      lastName: "",
      displayName: "Ada"
    });
  });
});
