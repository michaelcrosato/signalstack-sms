import { prisma } from "@/lib/db/prisma";
import { getTemplate } from "@/lib/db/repositories/templates";

const productTemplateMetricRowItems = [
  { key: "total", label: "Saved Templates" },
  { key: "variables", label: "Variables" },
  { key: "campaignUsage", label: "Campaign Usage" },
  { key: "liveSends", label: "Live Sends" }
] as const;

export const productTemplateMetricRows = Object.freeze(
  productTemplateMetricRowItems.map((row) => Object.freeze({ ...row }))
);

const productTemplateDetailMetricRowItems = [
  { key: "variables", label: "Variables" },
  { key: "campaignUsage", label: "Campaign Usage" },
  { key: "updated", label: "Updated" },
  { key: "liveSends", label: "Live Sends" }
] as const;

type ProductTemplateDetailMetricKey = (typeof productTemplateDetailMetricRowItems)[number]["key"];

export const productTemplateDetailMetricRows = Object.freeze(
  productTemplateDetailMetricRowItems.map((row) => Object.freeze({ ...row }))
);

export async function getProductTemplates(orgId: string) {
  const templates = await prisma.messageTemplate.findMany({
    where: { orgId },
    include: { _count: { select: { campaigns: true } } },
    orderBy: { updatedAt: "desc" }
  });

  const variableNames = [...new Set(templates.flatMap((template) => normalizeVariables(template.variables)))].sort();
  const campaignUsage = templates.reduce((total, template) => total + template._count.campaigns, 0);
  const summary = {
    total: templates.length,
    variables: variableNames.length,
    campaignUsage,
    liveSends: "blocked" as const
  };

  return {
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      body: template.body,
      variables: normalizeVariables(template.variables),
      campaignUsage: template._count.campaigns,
      updatedAt: template.updatedAt
    })),
    summary,
    metrics: productTemplateMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: summary[row.key]
    })),
    variableNames
  };
}

export async function getProductTemplateDetail(orgId: string, templateId: string) {
  const template = await getTemplate(orgId, templateId);

  if (!template) {
    return null;
  }

  const detail = {
    id: template.id,
    name: template.name,
    body: template.body,
    variables: normalizeVariables(template.variables),
    campaignUsage: template._count.campaigns,
    updatedAt: template.updatedAt
  };
  const metricValues: Record<ProductTemplateDetailMetricKey, string> = {
    variables: detail.variables.length.toString(),
    campaignUsage: detail.campaignUsage.toString(),
    updated: detail.updatedAt.toLocaleString("en-US"),
    liveSends: "blocked"
  };

  return {
    ...detail,
    metrics: productTemplateDetailMetricRows.map((row) => ({
      key: row.key,
      label: row.label,
      value: metricValues[row.key]
    }))
  };
}

function normalizeVariables(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
