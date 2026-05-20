import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createCampaign, listCampaigns } from "@/lib/db/repositories/campaigns";
import { campaignCreateSchema } from "@/lib/validation/campaigns";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const campaigns = await listCampaigns(currentOrg.orgId);

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = campaignCreateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid campaign payload.", issues: payload.error.issues }, { status: 400 });
  }

  const campaign = await createCampaign(currentOrg.orgId, payload.data);
  return NextResponse.json({ campaign }, { status: 201 });
}
