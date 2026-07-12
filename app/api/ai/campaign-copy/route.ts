import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { resolveAiProvider } from "@/lib/ai/provider";
import {
  aiDraftCapExceeded,
  countAiRequestsSince,
  recordFakeAiUsage,
  recordLiveAiUsage
} from "@/lib/ai/usage";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { campaignCopyRequestSchema } from "@/lib/validation/ai";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-error";

const CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  const payload = campaignCopyRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid campaign copy payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const provider = resolveAiProvider();

    if (provider.name === "live") {
      const usedInWindow = await countAiRequestsSince(currentOrg.orgId, new Date(Date.now() - CAP_WINDOW_MS));
      if (aiDraftCapExceeded(usedInWindow)) {
        return NextResponse.json({ error: "AI draft daily cap reached for this organization." }, { status: 429 });
      }
    }

    const response = await provider.generateCampaignCopy(payload.data);

    if (provider.name === "live") {
      await recordLiveAiUsage(currentOrg.orgId, "campaign-copy");
    } else {
      await recordFakeAiUsage(currentOrg.orgId, "campaign-copy");
    }

    return NextResponse.json(response);
  } catch (error) {
    return aiRouteErrorResponse("campaign-copy", error);
  }
}

