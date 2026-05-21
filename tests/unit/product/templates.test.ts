import { describe, expect, it, vi } from "vitest";
import { getProductTemplateDetail, getProductTemplates } from "@/lib/product/templates";

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
      campaignUsage: 2
    });
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
