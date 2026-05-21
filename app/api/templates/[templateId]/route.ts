import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getTemplate, updateTemplate } from "@/lib/db/repositories/templates";
import { extractTemplateVariables } from "@/lib/messaging/render-template";
import { templateCreateSchema } from "@/lib/validation/campaigns";

type TemplateParams = {
  params: Promise<{ templateId: string }>;
};

export async function GET(_request: Request, { params }: TemplateParams) {
  const [{ templateId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const template = await getTemplate(currentOrg.orgId, templateId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  return NextResponse.json({ template });
}

export async function PATCH(request: Request, { params }: TemplateParams) {
  const [{ templateId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json();
  const payload = templateCreateSchema.safeParse({
    ...rawPayload,
    variables: rawPayload.variables ?? extractTemplateVariables(rawPayload.body ?? "")
  });

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid template payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const template = await updateTemplate(currentOrg.orgId, templateId, payload.data);
    if (!template) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Template update failed." }, { status: 409 });
  }
}
