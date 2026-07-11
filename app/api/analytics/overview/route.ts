import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getAnalyticsOverview } from "@/lib/analytics/overview";

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const overview = await getAnalyticsOverview(currentOrg.orgId);

  return NextResponse.json({ overview });
}
