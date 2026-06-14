import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderTemplatePreview } from "@/lib/validation/template-preview";
import { POST as previewTemplateRoute } from "@/app/api/templates/preview/route";
import { prisma } from "@/lib/db/prisma";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

describe("Message Template Variable Substitution Validator & Preview Seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("substitutes placeholders and tracks missing and unused variables", () => {
    const body = "Hello {{firstName}}, your discount code is {{code}}.";

    // Success path
    const res1 = renderTemplatePreview(body, { firstName: "Alice", code: "SAVE20" });
    expect(res1.success).toBe(true);
    expect(res1.rendered).toBe("Hello Alice, your discount code is SAVE20.");
    expect(res1.missing).toEqual([]);
    expect(res1.unused).toEqual([]);

    // Missing path
    const res2 = renderTemplatePreview(body, { firstName: "Bob" });
    expect(res2.success).toBe(false);
    expect(res2.rendered).toBe("Hello Bob, your discount code is {{code}}.");
    expect(res2.missing).toEqual(["code"]);
    expect(res2.unused).toEqual([]);

    // Unused path
    const res3 = renderTemplatePreview(body, { firstName: "Charlie", code: "SAVE30", extra: "ignore" });
    expect(res3.success).toBe(true);
    expect(res3.rendered).toBe("Hello Charlie, your discount code is SAVE30.");
    expect(res3.missing).toEqual([]);
    expect(res3.unused).toEqual(["extra"]);

    // Multiple identical placeholders
    const bodyMulti = "{{name}}! Welcome {{name}}!";
    const resMulti = renderTemplatePreview(bodyMulti, { name: "Dave" });
    expect(resMulti.success).toBe(true);
    expect(resMulti.rendered).toBe("Dave! Welcome Dave!");
  });

  it("handles preview endpoint POST requests correctly", async () => {
    const org = await prisma.organization.create({
      data: { slug: `org-temp-${Date.now()}`, name: "Template Org", demoMode: true }
    });

    const template = await prisma.messageTemplate.create({
      data: {
        orgId: org.id,
        name: "Welcome Promo",
        body: "Hey {{firstName}}!",
        variables: ["firstName"]
      }
    });

    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: org.id,
      slug: org.slug,
      name: org.name,
      role: "ADMIN"
    });

    const request = new Request("http://localhost/api/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: template.id,
        variables: { firstName: "Eve" }
      })
    });

    const response = await previewTemplateRoute(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.rendered).toBe("Hey Eve!");
    expect(json.missing).toEqual([]);
    expect(json.unused).toEqual([]);
  });

  it("returns 404 for non-existent templates", async () => {
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "some_org",
      slug: "some_slug",
      name: "some_name",
      role: "ADMIN"
    });

    const request = new Request("http://localhost/api/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "non_existent_id",
        variables: {}
      })
    });

    const response = await previewTemplateRoute(request);
    expect(response.status).toBe(404);
  });
});
