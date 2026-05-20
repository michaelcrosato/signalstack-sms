import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const events = await listLiveReadinessAuditEvents(currentOrg.orgId);

  return NextResponse.json({ events });
}
