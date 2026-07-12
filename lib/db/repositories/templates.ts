import { withTenantTransaction } from "@/lib/db/tenant-context";
import type { TemplateCreateInput } from "@/lib/validation/campaigns";

export async function listTemplates(orgId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.messageTemplate.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" }
  }));
}

export async function getTemplate(orgId: string, templateId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.messageTemplate.findFirst({
    where: { id: templateId, orgId },
    include: { _count: { select: { campaigns: true } } }
  }));
}

export async function upsertTemplate(orgId: string, input: TemplateCreateInput) {
  return withTenantTransaction({ orgId }, (tx) => tx.messageTemplate.upsert({
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
  }));
}

export async function updateTemplate(orgId: string, templateId: string, input: TemplateCreateInput) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const existing = await tx.messageTemplate.findFirst({ where: { id: templateId, orgId } });

    if (!existing) {
      return null;
    }

    return tx.messageTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name,
        body: input.body,
        variables: input.variables
      }
    });
  });
}
