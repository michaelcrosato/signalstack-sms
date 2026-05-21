import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { cancelCampaign } from "@/lib/db/repositories/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(_request: Request, { params }: CampaignParams) {
  const [{ campaignId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const campaign = await cancelCampaign(currentOrg.orgId, campaignId);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}
