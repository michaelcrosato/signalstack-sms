import { describe, expect, it } from "vitest";
import {
  isTerminalDeliveryFailure,
  isTerminalDeliveryFailureProviderStatus,
  terminalDeliveryFailureProviderStatuses
} from "@/lib/messaging/delivery-status";

describe("delivery status helpers", () => {
  it("keeps terminal provider-failure statuses frozen and explicit", () => {
    expect(Object.isFrozen(terminalDeliveryFailureProviderStatuses)).toBe(true);
    expect([...terminalDeliveryFailureProviderStatuses]).toEqual(["failed", "undelivered"]);
    expect(() => (terminalDeliveryFailureProviderStatuses as unknown as string[]).push("error")).toThrow(TypeError);
  });

  it("classifies only terminal provider failures as delivery failures", () => {
    expect(isTerminalDeliveryFailureProviderStatus("failed")).toBe(true);
    expect(isTerminalDeliveryFailureProviderStatus("undelivered")).toBe(true);
    expect(isTerminalDeliveryFailureProviderStatus("delivered")).toBe(false);
    expect(isTerminalDeliveryFailureProviderStatus("sent")).toBe(false);
    expect(isTerminalDeliveryFailureProviderStatus(null)).toBe(false);
  });

  it("treats failed timestamps and terminal provider statuses as local delivery failures", () => {
    expect(isTerminalDeliveryFailure({ failedAt: new Date("2026-05-24T20:00:00.000Z"), providerStatus: "sent" })).toBe(
      true
    );
    expect(isTerminalDeliveryFailure({ failedAt: null, providerStatus: "undelivered" })).toBe(true);
    expect(isTerminalDeliveryFailure({ failedAt: null, providerStatus: "delivered" })).toBe(false);
    expect(isTerminalDeliveryFailure({ failedAt: null, providerStatus: null })).toBe(false);
  });
});
