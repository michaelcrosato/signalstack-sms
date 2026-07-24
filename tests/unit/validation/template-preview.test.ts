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

    const resSinglePass = renderTemplatePreview("{{first}} {{second}}", {
      first: "{{second}}",
      second: "safe"
    });
    expect(resSinglePass.rendered).toBe("{{second}} safe");
  });

  it("recognizes the same placeholders as the send path (whitespace, and literal for malformed)", () => {
    // Preview and send share one grammar: surrounding whitespace is tolerated...
    const spaced = renderTemplatePreview("Hi {{ firstName }}!", { firstName: "Ada" });
    expect(spaced.rendered).toBe("Hi Ada!");
    expect(spaced.missing).toEqual([]);

    // ...and a malformed placeholder is literal text in preview just as it is at send time, so a
    // preview can no longer look fine while the sent message renders it differently.
    const malformed = renderTemplatePreview("Hi {{first-name}}", { firstName: "Ada" });
    expect(malformed.rendered).toBe("Hi {{first-name}}");
    expect(malformed.missing).toEqual([]);
    expect(malformed.unused).toEqual(["firstName"]);
  });

  it("uses only own string variables and does not apply HTML encoding to SMS text", () => {
    const variables = Object.create({ inherited: "unsafe" }) as Record<string, string>;
    variables.name = "<b>Ada & Bob</b>";

    const result = renderTemplatePreview("{{name}} {{inherited}}", variables);
    expect(result.rendered).toBe("<b>Ada & Bob</b> {{inherited}}");
    expect(result.missing).toEqual(["inherited"]);
  });

  it.runIf(process.env.RUN_DB_TESTS === "true")("handles preview endpoint POST requests correctly", async () => {
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
      headers: sameOriginJsonHeaders(),
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

  it.runIf(process.env.RUN_DB_TESTS === "true")("returns 404 for non-existent templates", async () => {
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "some_org",
      slug: "some_slug",
      name: "some_name",
      role: "ADMIN"
    });

    const request = new Request("http://localhost/api/templates/preview", {
      method: "POST",
      headers: sameOriginJsonHeaders(),
      body: JSON.stringify({
        templateId: "non_existent_id",
        variables: {}
      })
    });

    const response = await previewTemplateRoute(request);
    expect(response.status).toBe(404);
  });

  it.each([
    { templateId: "template_1", variables: null },
    { templateId: "template_1", variables: [] },
    { templateId: "template_1", variables: { name: { nested: true } } },
    { templateId: "template_1", variables: { "invalid-key!": "value" } }
  ])("rejects non-string variable records before database access", async (body) => {
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "some_org",
      slug: "some_slug",
      name: "some_name",
      role: "ADMIN"
    });

    const response = await previewTemplateRoute(
      new Request("http://localhost/api/templates/preview", {
        method: "POST",
          headers: sameOriginJsonHeaders(),
        body: JSON.stringify(body)
      })
    );

    expect(response.status).toBe(400);
  });
});

function sameOriginJsonHeaders() {
  return { "Content-Type": "application/json", Origin: "http://localhost", Host: "localhost" };
}
