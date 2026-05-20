import { prisma } from "@/lib/db/prisma";
import type { TemplateCreateInput } from "@/lib/validation/campaigns";

export async function listTemplates(orgId: string) {
  return prisma.messageTemplate.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" }
  });
}

export async function upsertTemplate(orgId: string, input: TemplateCreateInput) {
  return prisma.messageTemplate.upsert({
    where: { orgId_name: { orgId, name: input.name } },
    update: {
      body: input.body,
      variables: input.variables
    },
    create: {
      orgId,
      name: input.name,
      body: input.body,
      variables: input.variables
    }
  });
}
