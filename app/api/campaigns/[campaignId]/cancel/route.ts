import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { cancelCampaign } from "@/lib/db/repositories/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

const campaignCancelConflictMessages = new Set([
  "Only scheduled campaigns can be canceled.",
  "A processing campaign cannot be canceled.",
  "Campaign cancellation conflicted with another transition."
]);

export async function POST(request: Request, { params }: CampaignParams) {
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

  try {
    const campaign = await cancelCampaign(currentOrg.orgId, campaignId);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof Error && campaignCancelConflictMessages.has(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "Campaign cancel failed." }, { status: 500 });
  }
}
