import { describe, expect, it } from "vitest";
import { getApiOperationsStatus } from "@/lib/operations/api-operations";

describe("getApiOperationsStatus", () => {
  it("reports local API route inventory and keeps external impact at zero", () => {
    const status = getApiOperationsStatus({});

    expect(status.routeCount).toBeGreaterThan(30);
    expect(status.mutatingRouteCount).toBeGreaterThan(10);
    expect(status.externalImpactRouteCount).toBe(0);
    expect(status.routes.every((route) => route.path.startsWith("/api/"))).toBe(true);
    expect(status.routes.some((route) => route.path === "/api/webhooks/twilio/inbound")).toBe(true);
    expect(status.routes.some((route) => route.path === "/api/settings/provider/rotations/export")).toBe(true);
    expect(status.rateLimit).toMatchObject({
      enabled: true,
      limit: 120,
      windowSeconds: 60
    });
  });

  it("surfaces bounded API rate limit settings", () => {
    const status = getApiOperationsStatus({
      API_RATE_LIMIT_ENABLED: "false",
      API_RATE_LIMIT_MAX: "25",
      API_RATE_LIMIT_WINDOW_MS: "5000"
    });

    expect(status.rateLimit).toMatchObject({
      enabled: false,
      limit: 25,
      windowSeconds: 5
    });
  });
});
