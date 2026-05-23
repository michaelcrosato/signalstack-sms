import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { assertFakeAiProvider, fakeCampaignCopyVariants } from "@/lib/ai/fake-ai-provider";
import { recordFakeAiUsage } from "@/lib/ai/usage";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { campaignCopyRequestSchema } from "@/lib/validation/ai";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = campaignCopyRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid campaign copy payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    assertFakeAiProvider();
    const response = fakeCampaignCopyVariants(payload.data);
    await recordFakeAiUsage(currentOrg.orgId, "campaign-copy");
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI provider blocked." }, { status: 403 });
  }
}
