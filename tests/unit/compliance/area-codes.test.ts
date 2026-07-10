import { describe, expect, it } from "vitest";
import { resolveTimezoneFromPhone } from "@/lib/compliance/area-codes";

describe("resolveTimezoneFromPhone", () => {
  it("resolves timezone from E.164 formatted US phone numbers", () => {
    // 212 is America/New_York
    expect(resolveTimezoneFromPhone("+12125551234")).toBe("America/New_York");
    // 312 is America/Chicago
    expect(resolveTimezoneFromPhone("+13125551234")).toBe("America/Chicago");
    // 303 is America/Denver
    expect(resolveTimezoneFromPhone("+13035551234")).toBe("America/Denver");
    // 206 is America/Los_Angeles
    expect(resolveTimezoneFromPhone("+12065551234")).toBe(
      "America/Los_Angeles",
    );
  });

  it("resolves timezone from 10-digit formatted phone numbers", () => {
    expect(resolveTimezoneFromPhone("2125551234")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("3125551234")).toBe("America/Chicago");
  });

  it("resolves timezone from phone numbers with formatting characters", () => {
    expect(resolveTimezoneFromPhone("+1 (212) 555-1234")).toBe(
      "America/New_York",
    );
    expect(resolveTimezoneFromPhone("212-555-1234")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("312.555.1234")).toBe("America/Chicago");
  });

  it("defaults to America/New_York for unknown US area codes", () => {
    // 999 is not a valid area code in the list
    expect(resolveTimezoneFromPhone("+19995551234")).toBe("America/New_York");
    expect(resolveTimezoneFromPhone("9995551234")).toBe("America/New_York");
  });

  it("defaults to America/New_York for invalid or non-US phone numbers", () => {
    // UK phone number
    expect(resolveTimezoneFromPhone("+442079460958")).toBe("America/New_York");
    // Short number
    expect(resolveTimezoneFromPhone("12345")).toBe("America/New_York");
    // Empty string
    expect(resolveTimezoneFromPhone("")).toBe("America/New_York");
    // Garbage input
    expect(resolveTimezoneFromPhone("not-a-phone-number")).toBe(
      "America/New_York",
    );
  });
});
