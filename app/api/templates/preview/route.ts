import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { orgWhere } from "@/lib/db/tenant";
import { renderTemplatePreview, templatePreviewSchema } from "@/lib/validation/template-preview";
import { withOptionalTenantRls } from "@/lib/db/rls";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = templatePreviewSchema.safeParse(rawPayload);
  if (!payload.success) {
    return NextResponse.json(
      {
        error: "Invalid template preview request payload. Requires templateId and string variables.",
        issues: payload.error.issues
      },
      { status: 400 }
    );
  }

  const { templateId, variables } = payload.data;

  const template = await withOptionalTenantRls(currentOrg.orgId, async (tx) => {
    return tx.messageTemplate.findFirst({
      where: orgWhere(currentOrg.orgId, { id: templateId })
    });
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const result = renderTemplatePreview(template.body, variables);

  return NextResponse.json({
    success: result.success,
    rendered: result.rendered,
    missing: result.missing,
    unused: result.unused
  });
}
