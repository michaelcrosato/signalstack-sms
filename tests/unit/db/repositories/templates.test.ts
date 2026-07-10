import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listTemplates,
  getTemplate,
  upsertTemplate,
  updateTemplate
} from "@/lib/db/repositories/templates";

const mocks = vi.hoisted(() => ({
  messageTemplateFindMany: vi.fn(),
  messageTemplateFindFirst: vi.fn(),
  messageTemplateUpsert: vi.fn(),
  messageTemplateUpdate: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    messageTemplate: {
      findMany: mocks.messageTemplateFindMany,
      findFirst: mocks.messageTemplateFindFirst,
      upsert: mocks.messageTemplateUpsert,
      update: mocks.messageTemplateUpdate
    }
  }
}));

describe("Templates Repository", () => {
  const orgId = "org_123";
  const templateId = "tmpl_456";
  const mockInput = {
    name: "Test Template",
    body: "Hello {{name}}",
    variables: ["name"]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTemplates", () => {
    it("should query templates by orgId and order by updatedAt desc", async () => {
      const mockResult = [{ id: "1", name: "Template 1" }];
      mocks.messageTemplateFindMany.mockResolvedValue(mockResult);

      const result = await listTemplates(orgId);

      expect(mocks.messageTemplateFindMany).toHaveBeenCalledWith({
        where: { orgId },
        orderBy: { updatedAt: "desc" }
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe("getTemplate", () => {
    it("should find a template by orgId and templateId and include campaigns count", async () => {
      const mockResult = { id: templateId, name: "Template 1" };
      mocks.messageTemplateFindFirst.mockResolvedValue(mockResult);

      const result = await getTemplate(orgId, templateId);

      expect(mocks.messageTemplateFindFirst).toHaveBeenCalledWith({
        where: { id: templateId, orgId },
        include: { _count: { select: { campaigns: true } } }
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe("upsertTemplate", () => {
    it("should upsert a template mapping correct values", async () => {
      const mockResult = { id: "1", ...mockInput, orgId };
      mocks.messageTemplateUpsert.mockResolvedValue(mockResult);

      const result = await upsertTemplate(orgId, mockInput);

      expect(mocks.messageTemplateUpsert).toHaveBeenCalledWith({
        where: { orgId_name: { orgId, name: mockInput.name } },
        update: {
          body: mockInput.body,
          variables: mockInput.variables
        },
        create: {
          orgId,
          name: mockInput.name,
          body: mockInput.body,
          variables: mockInput.variables
        }
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe("updateTemplate", () => {
    it("should return null if template is not found", async () => {
      mocks.messageTemplateFindFirst.mockResolvedValue(null);

      const result = await updateTemplate(orgId, templateId, mockInput);

      expect(mocks.messageTemplateFindFirst).toHaveBeenCalledWith({
        where: { id: templateId, orgId }
      });
      expect(mocks.messageTemplateUpdate).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should update a template if it is found", async () => {
      mocks.messageTemplateFindFirst.mockResolvedValue({ id: templateId, orgId });
      const mockUpdated = { id: templateId, ...mockInput, orgId };
      mocks.messageTemplateUpdate.mockResolvedValue(mockUpdated);

      const result = await updateTemplate(orgId, templateId, mockInput);

      expect(mocks.messageTemplateFindFirst).toHaveBeenCalledWith({
        where: { id: templateId, orgId }
      });
      expect(mocks.messageTemplateUpdate).toHaveBeenCalledWith({
        where: { id: templateId },
        data: {
          name: mockInput.name,
          body: mockInput.body,
          variables: mockInput.variables
        }
      });
      expect(result).toEqual(mockUpdated);
    });
  });
});
