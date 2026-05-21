import { prisma } from "@/lib/db/prisma";

export async function getProductTemplates(orgId: string) {
  const templates = await prisma.messageTemplate.findMany({
    where: { orgId },
    include: { _count: { select: { campaigns: true } } },
    orderBy: { updatedAt: "desc" }
  });

  const variableNames = [...new Set(templates.flatMap((template) => normalizeVariables(template.variables)))].sort();
  const campaignUsage = templates.reduce((total, template) => total + template._count.campaigns, 0);

  return {
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      body: template.body,
      variables: normalizeVariables(template.variables),
      campaignUsage: template._count.campaigns,
      updatedAt: template.updatedAt
    })),
    summary: {
      total: templates.length,
      variables: variableNames.length,
      campaignUsage
    },
    variableNames
  };
}

function normalizeVariables(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
