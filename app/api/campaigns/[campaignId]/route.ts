import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getCampaign, updateCampaign } from "@/lib/db/repositories/campaigns";
import { campaignUpdateSchema } from "@/lib/validation/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

export async function GET(_request: Request, { params }: CampaignParams) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { campaignId } = await params;
  const campaign = await getCampaign(currentOrg.orgId, campaignId);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(request: Request, { params }: CampaignParams) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { campaignId } = await params;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = campaignUpdateSchema.safeParse(rawPayload);

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
    const conflictMessages = new Set([
      "Campaign template not found.",
      "Only draft campaigns can be edited."
    ]);
    if (!(error instanceof Error) || !conflictMessages.has(error.message)) {
      return NextResponse.json({ error: "Campaign update failed." }, { status: 500 });
    }

    return NextResponse.json({ error: error.message }, { status: 409 });
  }
}
