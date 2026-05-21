import { describe, expect, it } from "vitest";
import { productNavigation } from "@/lib/product/dashboard";

describe("product dashboard navigation", () => {
  it("keeps the primary product areas in stable order", () => {
    expect(productNavigation.map((item) => item.label)).toEqual([
      "Contacts",
      "Campaigns",
      "Inbox",
      "Templates",
      "Analytics",
      "Compliance",
      "Settings"
    ]);
    expect(productNavigation.map((item) => item.href)).toEqual([
      "#contacts",
      "#campaigns",
      "#inbox",
      "#templates",
      "#analytics",
      "#compliance",
      "/settings"
    ]);
  });

  it("is frozen before the product shell renders navigation", () => {
    expect(Object.isFrozen(productNavigation)).toBe(true);
    expect(() =>
      (productNavigation as unknown as Array<{ href: string; label: string; note: string }>).push({
        href: "#unsafe",
        label: "Unsafe",
        note: "unsafe route"
      })
    ).toThrow(TypeError);
  });
});
