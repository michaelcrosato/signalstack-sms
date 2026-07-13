import { describe, expect, it, vi } from "vitest";
import {
  claimDueCustomerWebhookDeliveries,
  CUSTOMER_WEBHOOK_PROCESSING_LEASE_MS
} from "@/lib/db/customer-webhook-dispatch";

const PROCESSING_TOKEN = "123e4567-e89b-42d3-a456-426614174000";

describe("customer webhook worker dispatch", () => {
  it("bounds the batch, supplies the reviewed lease/token inputs, and returns frozen claims", async () => {
    const claimRows = vi.fn().mockResolvedValue([
      { deliveryId: "delivery_1", orgId: "org_1" },
      { deliveryId: "delivery_2", orgId: "org_2" }
    ]);

    const claims = await claimDueCustomerWebhookDeliveries(250.9, {
      createProcessingToken: () => PROCESSING_TOKEN,
      claimRows
    });

    expect(claimRows).toHaveBeenCalledWith({
      maxDeliveries: 100,
      leaseMs: CUSTOMER_WEBHOOK_PROCESSING_LEASE_MS,
      processingToken: PROCESSING_TOKEN
    });
    expect(claims).toEqual([
      { deliveryId: "delivery_1", expectedOrgId: "org_1", processingToken: PROCESSING_TOKEN },
      { deliveryId: "delivery_2", expectedOrgId: "org_2", processingToken: PROCESSING_TOKEN }
    ]);
    expect(Object.isFrozen(claims)).toBe(true);
    expect(claims.every(Object.isFrozen)).toBe(true);
  });

  it("fails before database discovery for non-finite limits or malformed internally generated tokens", async () => {
    const claimRows = vi.fn().mockResolvedValue([]);

    await expect(
      claimDueCustomerWebhookDeliveries(Number.NaN, {
        createProcessingToken: () => PROCESSING_TOKEN,
        claimRows
      })
    ).rejects.toThrow("limit is invalid");
    await expect(
      claimDueCustomerWebhookDeliveries(5, {
        createProcessingToken: () => "attacker-controlled-token",
        claimRows
      })
    ).rejects.toThrow("processing token");
    expect(claimRows).not.toHaveBeenCalled();
  });

  it("rejects excess, duplicate, malformed, and control-character identities", async () => {
    const dependencies = (rows: unknown) => ({
      createProcessingToken: () => PROCESSING_TOKEN,
      claimRows: vi.fn().mockResolvedValue(rows)
    });

    await expect(claimDueCustomerWebhookDeliveries(1, dependencies([
      { deliveryId: "delivery_1", orgId: "org_1" },
      { deliveryId: "delivery_2", orgId: "org_1" }
    ]))).rejects.toThrow("too many");
    await expect(claimDueCustomerWebhookDeliveries(5, dependencies([
      { deliveryId: "delivery_1", orgId: "org_1" },
      { deliveryId: "delivery_1", orgId: "org_2" }
    ]))).rejects.toThrow("duplicate");
    await expect(claimDueCustomerWebhookDeliveries(5, dependencies([
      { deliveryId: "delivery\u0000evil", orgId: "org_1" }
    ]))).rejects.toThrow("invalid delivery identity");
    await expect(claimDueCustomerWebhookDeliveries(5, dependencies(null))).rejects.toThrow("invalid result");
  });
});
