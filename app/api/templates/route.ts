import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listTemplates, upsertTemplate } from "@/lib/db/repositories/templates";
import { extractTemplateVariables } from "@/lib/messaging/render-template";
import { templateCreateSchema } from "@/lib/validation/campaigns";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const templates = await listTemplates(currentOrg.orgId);

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
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

  const template = await upsertTemplate(currentOrg.orgId, payload.data);
  return NextResponse.json({ template }, { status: 201 });
}
