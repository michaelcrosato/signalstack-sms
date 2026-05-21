import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { preflightCampaign } from "@/lib/db/repositories/campaigns";
import { campaignPreflightSchema } from "@/lib/validation/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: Request, { params }: CampaignParams) {
  const [{ campaignId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const payload = campaignPreflightSchema.safeParse(await request.json().catch(() => ({})));

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid preflight payload.", issues: payload.error.issues }, { status: 400 });
  }

  const preflight = await preflightCampaign(currentOrg.orgId, campaignId, payload.data.contactIds);
  if (!preflight) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  return NextResponse.json({ preflight });
}
