import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getAnalyticsOverview } from "@/lib/analytics/overview";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const overview = await getAnalyticsOverview(currentOrg.orgId);

  return NextResponse.json({ overview });
}
