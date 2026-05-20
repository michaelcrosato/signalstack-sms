import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getUsageSummary, recordUsageEvent } from "@/lib/billing/metering";
import { usageEventCreateSchema } from "@/lib/validation/billing";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const usage = await getUsageSummary(currentOrg.orgId);

  return NextResponse.json({ usage });
}

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = usageEventCreateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid usage event payload.", issues: payload.error.issues }, { status: 400 });
  }

  const event = await recordUsageEvent(currentOrg.orgId, payload.data);
  const usage = await getUsageSummary(currentOrg.orgId);

  return NextResponse.json({ event, usage }, { status: 201 });
}
