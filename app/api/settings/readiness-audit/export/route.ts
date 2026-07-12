import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { serializeReadinessAuditEventsCsv } from "@/lib/compliance/readiness-audit-export";
import { listLiveReadinessAuditEvents } from "@/lib/db/repositories/readiness-audit";
import { readinessAuditQuerySchema } from "@/lib/validation/readiness-audit";

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const url = new URL(request.url);
  const query = readinessAuditQuerySchema.safeParse({
    action: url.searchParams.get("action") ?? undefined,
    subjectType: url.searchParams.get("subjectType") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!query.success) {
    return NextResponse.json({ error: "Invalid readiness audit export query.", issues: query.error.flatten() }, { status: 400 });
  }

  const events = await listLiveReadinessAuditEvents(currentOrg.orgId, query.data.limit, query.data);
  const csv = serializeReadinessAuditEventsCsv(events);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"signalstack-readiness-audit.csv\""
    }
  });
}
