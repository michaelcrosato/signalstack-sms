import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listTemplates,
  getTemplate,
  upsertTemplate,
  updateTemplate
} from "@/lib/db/repositories/templates";
import type { TemplateCreateInput } from "@/lib/validation/campaigns";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    messageTemplate: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      upsert: mocks.upsert,
      update: mocks.update
    }
  }
}));

describe("Template Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTemplates", () => {
    it("should return templates for an org ordered by updatedAt desc", async () => {
      const mockTemplates = [{ id: "t1" }, { id: "t2" }];
      mocks.findMany.mockResolvedValue(mockTemplates);

      const result = await listTemplates("org1");

      expect(result).toEqual(mockTemplates);
      expect(mocks.findMany).toHaveBeenCalledWith({
        where: { orgId: "org1" },
        orderBy: { updatedAt: "desc" }
      });
    });
  });

  describe("getTemplate", () => {
    it("should return a template with campaigns count", async () => {
      const mockTemplate = { id: "t1", _count: { campaigns: 5 } };
      mocks.findFirst.mockResolvedValue(mockTemplate);

      const result = await getTemplate("org1", "t1");

      expect(result).toEqual(mockTemplate);
      expect(mocks.findFirst).toHaveBeenCalledWith({
        where: { id: "t1", orgId: "org1" },
        include: { _count: { select: { campaigns: true } } }
      });
    });

    it("should return null if template is not found", async () => {
      mocks.findFirst.mockResolvedValue(null);

      const result = await getTemplate("org1", "t1");

      expect(result).toBeNull();
    });
  });

  describe("upsertTemplate", () => {
    it("should upsert a template", async () => {
      const mockInput: TemplateCreateInput = { name: "Test Template", body: "Hello {{name}}", variables: ["name"] };
      const mockResult = { id: "t1", ...mockInput };
      mocks.upsert.mockResolvedValue(mockResult);

      const result = await upsertTemplate("org1", mockInput);

      expect(result).toEqual(mockResult);
      expect(mocks.upsert).toHaveBeenCalledWith({
        where: { orgId_name: { orgId: "org1", name: mockInput.name } },
        update: {
          body: mockInput.body,
          variables: mockInput.variables
        },
        create: {
          orgId: "org1",
          name: mockInput.name,
          body: mockInput.body,
          variables: mockInput.variables
        }
      });
    });
  });

  describe("updateTemplate", () => {
    it("should return null if template does not exist", async () => {
      mocks.findFirst.mockResolvedValue(null);
      const mockInput: TemplateCreateInput = { name: "Test Template", body: "Hello", variables: [] };

      const result = await updateTemplate("org1", "t1", mockInput);

      expect(result).toBeNull();
      expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "t1", orgId: "org1" } });
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it("should update and return the template if it exists", async () => {
      const existingTemplate = { id: "t1", orgId: "org1" };
      mocks.findFirst.mockResolvedValue(existingTemplate);

      const mockInput: TemplateCreateInput = { name: "Updated Template", body: "Hello {{name}}", variables: ["name"] };
      const mockUpdated = { ...existingTemplate, ...mockInput };
      mocks.update.mockResolvedValue(mockUpdated);

      const result = await updateTemplate("org1", "t1", mockInput);

      expect(result).toEqual(mockUpdated);
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          name: mockInput.name,
          body: mockInput.body,
          variables: mockInput.variables
        }
      });
    });
  });
});
