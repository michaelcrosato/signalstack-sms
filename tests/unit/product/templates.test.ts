import { describe, expect, it, vi } from "vitest";
import { productTemplateFormDefaults } from "@/lib/product/template-form-defaults";
import { getProductTemplateDetail, getProductTemplates, productTemplateMetricRows } from "@/lib/product/templates";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    messageTemplate: {
      findMany: vi.fn(async () => [
        {
          id: "template_1",
          name: "Intro",
          body: "Hi {{firstName}}",
          variables: ["firstName"],
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          _count: { campaigns: 2 }
        },
        {
          id: "template_2",
          name: "Follow-up",
          body: "Reply STOP to opt out.",
          variables: null,
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          _count: { campaigns: 0 }
        }
      ])
    }
  }
}));

vi.mock("@/lib/db/repositories/templates", () => ({
  getTemplate: vi.fn(async (_orgId: string, templateId: string) =>
    templateId === "missing"
      ? null
      : {
          id: templateId,
          name: "Intro",
          body: "Hi {{firstName}} from {{company}}",
          variables: ["company", "firstName"],
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
          _count: { campaigns: 3 }
        }
  )
}));

describe("getProductTemplates", () => {
  it("builds template workspace rows and summary values", async () => {
    const result = await getProductTemplates("org_1");

    expect(result.summary).toEqual({
      total: 2,
      variables: 1,
      campaignUsage: 2,
      liveSends: "blocked"
    });
    expect(result.metrics).toEqual([
      { key: "total", label: "Saved Templates", value: 2 },
      { key: "variables", label: "Variables", value: 1 },
      { key: "campaignUsage", label: "Campaign Usage", value: 2 },
      { key: "liveSends", label: "Live Sends", value: "blocked" }
    ]);
    expect(result.templates).toEqual([
      {
        id: "template_1",
        name: "Intro",
        body: "Hi {{firstName}}",
        variables: ["firstName"],
        campaignUsage: 2,
        updatedAt: new Date("2026-01-02T00:00:00.000Z")
      },
      {
        id: "template_2",
        name: "Follow-up",
        body: "Reply STOP to opt out.",
        variables: [],
        campaignUsage: 0,
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);
    expect(result.variableNames).toEqual(["firstName"]);
  });

  it("freezes template metric metadata before rendering", () => {
    expect(Object.isFrozen(productTemplateMetricRows)).toBe(true);
    expect(productTemplateMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productTemplateMetricRows.map((row) => row.key)).toEqual([
      "total",
      "variables",
      "campaignUsage",
      "liveSends"
    ]);

    expect(() =>
      (productTemplateMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productTemplateMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productTemplateMetricRows[0].label).toBe("Saved Templates");
  });

  it("freezes template create-form defaults before rendering", () => {
    expect(Object.isFrozen(productTemplateFormDefaults)).toBe(true);
    expect(productTemplateFormDefaults).toEqual({
      name: "Product demo follow-up",
      body: "Hi {{firstName}}, your SignalStack demo is ready. Reply STOP to opt out."
    });

    expect(() => {
      (productTemplateFormDefaults as { name: string }).name = "Unsafe";
    }).toThrow(TypeError);
    expect(() => {
      (productTemplateFormDefaults as { body: string }).body = "Unsafe";
    }).toThrow(TypeError);
    expect(productTemplateFormDefaults.name).toBe("Product demo follow-up");
  });
});

describe("getProductTemplateDetail", () => {
  it("builds a tenant-scoped template detail projection", async () => {
    await expect(getProductTemplateDetail("org_1", "template_1")).resolves.toEqual({
      id: "template_1",
      name: "Intro",
      body: "Hi {{firstName}} from {{company}}",
      variables: ["company", "firstName"],
      campaignUsage: 3,
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    });
  });

  it("returns null for missing template detail", async () => {
    await expect(getProductTemplateDetail("org_1", "missing")).resolves.toBeNull();
  });
});
