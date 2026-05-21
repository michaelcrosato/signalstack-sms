import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getCampaign, updateCampaign } from "@/lib/db/repositories/campaigns";
import { campaignUpdateSchema } from "@/lib/validation/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

export async function GET(_request: Request, { params }: CampaignParams) {
  const [{ campaignId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const campaign = await getCampaign(currentOrg.orgId, campaignId);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(request: Request, { params }: CampaignParams) {
  const [{ campaignId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const payload = campaignUpdateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid campaign payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const campaign = await updateCampaign(currentOrg.orgId, campaignId, payload.data);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign update failed." }, { status: 409 });
  }
}
