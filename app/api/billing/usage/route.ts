import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getUsageSummary, recordUsageEvent } from "@/lib/billing/metering";
import { usageEventCreateSchema } from "@/lib/validation/billing";

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const usage = await getUsageSummary(currentOrg.orgId);

  return NextResponse.json({ usage });
}

export async function POST(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = usageEventCreateSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid usage event payload.", issues: payload.error.issues }, { status: 400 });
  }

  const event = await recordUsageEvent(currentOrg.orgId, payload.data);
  const usage = await getUsageSummary(currentOrg.orgId);

  return NextResponse.json({ event, usage }, { status: 201 });
}
