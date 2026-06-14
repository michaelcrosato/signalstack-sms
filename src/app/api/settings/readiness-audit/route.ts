import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { readinessAuditQuerySchema } from "@/lib/validation/readiness-audit";

export async function GET(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const url = new URL(request.url);
  const query = readinessAuditQuerySchema.safeParse({
    action: url.searchParams.get("action") ?? undefined,
    subjectType: url.searchParams.get("subjectType") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!query.success) {
    return NextResponse.json({ error: "Invalid readiness audit query.", issues: query.error.flatten() }, { status: 400 });
  }

  const events = await listLiveReadinessAuditEvents(currentOrg.orgId, query.data.limit, query.data);

  return NextResponse.json({ events });
}
