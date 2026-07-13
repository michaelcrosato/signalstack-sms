import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { evaluateSegmentContacts } from "@/lib/db/repositories/segments";
import { withOptionalTenantRls } from "@/lib/db/rls";
import { parseSegmentFilterParams } from "@/lib/validation/segments";

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { searchParams } = new URL(request.url);

  const parsedFilter = parseSegmentFilterParams(searchParams);
  if (!parsedFilter.ok) {
    return NextResponse.json({ error: parsedFilter.error }, { status: 400 });
  }

  const contacts = await withOptionalTenantRls(currentOrg.orgId, async (tx) => {
    return evaluateSegmentContacts(currentOrg.orgId, parsedFilter.filter, tx);
  });

  return NextResponse.json({ contacts });
}
