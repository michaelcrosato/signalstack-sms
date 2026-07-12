import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { createCampaign, listCampaigns } from "@/lib/db/repositories/campaigns";
import { campaignCreateSchema } from "@/lib/validation/campaigns";

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const campaigns = await listCampaigns(currentOrg.orgId);

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = campaignCreateSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid campaign payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const campaign = await createCampaign(currentOrg.orgId, payload.data);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Campaign template not found.") {
      return NextResponse.json({ error: "Campaign creation failed." }, { status: 500 });
    }

    return NextResponse.json(
      { error: error.message },
      { status: 409 }
    );
  }
}
