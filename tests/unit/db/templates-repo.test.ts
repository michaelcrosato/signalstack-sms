import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  listTemplates,
  getTemplate,
  upsertTemplate,
  updateTemplate
} from "@/lib/db/repositories/templates";
import type { TemplateCreateInput } from "@/lib/validation/campaigns";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    messageTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("templates repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTemplates", () => {
    it("should return templates scoped to orgId and ordered by updatedAt desc", async () => {
      const mockTemplates = [{ id: "t1", name: "Template 1" }];
      vi.mocked(prisma.messageTemplate.findMany).mockResolvedValue(mockTemplates as never);

      const result = await listTemplates("org1");

      expect(prisma.messageTemplate.findMany).toHaveBeenCalledWith({
        where: { orgId: "org1" },
        orderBy: { updatedAt: "desc" },
      });
      expect(result).toEqual(mockTemplates);
    });
  });

  describe("getTemplate", () => {
    it("should return a template with campaigns count", async () => {
      const mockTemplate = { id: "t1", name: "Template 1" };
      vi.mocked(prisma.messageTemplate.findFirst).mockResolvedValue(mockTemplate as never);

      const result = await getTemplate("org1", "t1");

      expect(prisma.messageTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: "t1", orgId: "org1" },
        include: { _count: { select: { campaigns: true } } },
      });
      expect(result).toEqual(mockTemplate);
    });
  });

  describe("upsertTemplate", () => {
    it("should call prisma upsert with correct parameters", async () => {
      const input: TemplateCreateInput = {
        name: "Test Template",
        body: "Hello {{name}}",
        variables: ["name"],
      };
      const mockResult = { id: "t1", ...input };
      vi.mocked(prisma.messageTemplate.upsert).mockResolvedValue(mockResult as never);

      const result = await upsertTemplate("org1", input);

      expect(prisma.messageTemplate.upsert).toHaveBeenCalledWith({
        where: { orgId_name: { orgId: "org1", name: input.name } },
        update: {
          body: input.body,
          variables: input.variables,
        },
        create: {
          orgId: "org1",
          name: input.name,
          body: input.body,
          variables: input.variables,
        },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe("updateTemplate", () => {
    it("should return null if the template does not exist or belong to the org", async () => {
      vi.mocked(prisma.messageTemplate.findFirst).mockResolvedValue(null);

      const input: TemplateCreateInput = {
        name: "Updated Template",
        body: "Hello updated",
        variables: [],
      };

      const result = await updateTemplate("org1", "t1", input);

      expect(prisma.messageTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: "t1", orgId: "org1" },
      });
      expect(prisma.messageTemplate.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should update and return the template if it exists", async () => {
      const mockExisting = { id: "t1", orgId: "org1" };
      vi.mocked(prisma.messageTemplate.findFirst).mockResolvedValue(mockExisting as never);

      const input: TemplateCreateInput = {
        name: "Updated Template",
        body: "Hello updated",
        variables: [],
      };

      const mockUpdated = { id: "t1", ...input };
      vi.mocked(prisma.messageTemplate.update).mockResolvedValue(mockUpdated as never);

      const result = await updateTemplate("org1", "t1", input);

      expect(prisma.messageTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: "t1", orgId: "org1" },
      });
      expect(prisma.messageTemplate.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          name: input.name,
          body: input.body,
          variables: input.variables,
        },
      });
      expect(result).toEqual(mockUpdated);
    });
  });
});
