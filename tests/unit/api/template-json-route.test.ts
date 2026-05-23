import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/templates/route";
import { PATCH } from "@/app/api/templates/[templateId]/route";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn(),
  getTemplate: vi.fn(),
  listTemplates: vi.fn(),
  requireApiRole: vi.fn(),
  updateTemplate: vi.fn(),
  upsertTemplate: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/repositories/templates", () => ({
  getTemplate: mocks.getTemplate,
  listTemplates: mocks.listTemplates,
  updateTemplate: mocks.updateTemplate,
  upsertTemplate: mocks.upsertTemplate
}));

describe("template JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed create JSON without creating or updating a local template", async () => {
    const response = await POST(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid template payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.upsertTemplate).not.toHaveBeenCalled();
  });

  it("rejects malformed update JSON without updating a tenant template", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/templates/template_demo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }),
      { params: Promise.resolve({ templateId: "template_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid template payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.updateTemplate).not.toHaveBeenCalled();
  });
});
