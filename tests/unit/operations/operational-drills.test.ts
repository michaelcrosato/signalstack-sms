import { describe, expect, it } from "vitest";
import { OPERATIONAL_DRILL_CATALOG, verifyOperationalDrills } from "@/lib/operations/operational-drills";

describe("End-to-End Operational Drills Verification", () => {
  it("contains all 9 required operational drill flows in catalog", () => {
    expect(OPERATIONAL_DRILL_CATALOG.length).toBe(9);
    const flows = OPERATIONAL_DRILL_CATALOG.map((item) => item.flow);
    expect(flows).toContain("owner-onboarding");
    expect(flows).toContain("api-key-auth");
    expect(flows).toContain("direct-send-reservation");
    expect(flows).toContain("inbound-reply-processing");
    expect(flows).toContain("stop-optout-suppression");
    expect(flows).toContain("campaign-outbox-dispatch");
    expect(flows).toContain("worker-restart-resilience");
    expect(flows).toContain("webhook-delivery-callbacks");
    expect(flows).toContain("database-encrypted-backup-restore");
  });

  it("verifies all operational drill implementation artifacts exist on disk", () => {
    const { allPassed, results } = verifyOperationalDrills();
    expect(allPassed).toBe(true);
    expect(results.length).toBe(9);
    for (const result of results) {
      expect(result.verified).toBe(true);
      expect(result.evidence).toContain("Verified implementation artifacts");
    }
  });
});
