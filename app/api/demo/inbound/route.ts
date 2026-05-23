import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createDemoInboundMessage } from "@/lib/db/repositories/inbox";
import { inboundMessageSchema } from "@/lib/validation/inbox";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = inboundMessageSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid demo inbound payload.", issues: payload.error.issues }, { status: 400 });
  }

  const result = await createDemoInboundMessage(currentOrg.orgId, payload.data);
  return NextResponse.json(result, { status: 201 });
}
