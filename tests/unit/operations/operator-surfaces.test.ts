import { describe, expect, it } from "vitest";
import { getOperatorSurfaceSummary, operatorSurfaceGroups } from "@/lib/operations/operator-surfaces";

describe("operator surface inventory", () => {
  it("keeps the operations index grouped around the current local-only surfaces", () => {
    const summary = getOperatorSurfaceSummary();

    expect(summary.groupCount).toBe(4);
    expect(summary.surfaceCount).toBe(34);
    expect(new Set(summary.routes).size).toBe(summary.surfaceCount);
    expect(summary.routes).toEqual(
      expect.arrayContaining([
        "/settings/releases",
        "/settings/health",
        "/settings/environment",
        "/settings/security",
        "/settings/readiness-audit",
        "/settings/provider",
        "/settings/notifications"
      ])
    );
  });

  it("keeps every listed surface on a local route", () => {
    const links = operatorSurfaceGroups.flatMap((group) => group.links);

    expect(links.every((link) => link.href === "/" || link.href.startsWith("/"))).toBe(true);
    expect(links.every((link) => !link.href.startsWith("/api/"))).toBe(true);
    expect(links.every((link) => link.label.length > 0 && link.note.length > 0)).toBe(true);
  });
});
