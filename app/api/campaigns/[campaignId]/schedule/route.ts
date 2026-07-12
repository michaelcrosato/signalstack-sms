import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { scheduleCampaign } from "@/lib/db/repositories/campaigns";
import { enqueueScheduledCampaignBullMqJob } from "@/lib/queue/bullmq";
import { campaignScheduleSchema } from "@/lib/validation/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

const campaignScheduleConflictMessages = new Set([
  "Only draft or paused campaigns can be scheduled.",
  "Campaign schedule is already processing.",
  "Campaign preflight failed.",
  "Campaign schedule is already processing or complete."
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

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid schedule payload.", issues: [] }, { status: 400 });
  }

  const payload = campaignScheduleSchema.safeParse(requestBody);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid schedule payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const queueJob = await scheduleCampaign(currentOrg.orgId, campaignId, new Date(payload.data.scheduledAt));
    if (!queueJob) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    const bullMq = await enqueueScheduledCampaignBullMqJob(queueJob);
    return NextResponse.json({ queueJob, bullMq }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && campaignScheduleConflictMessages.has(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "Campaign schedule failed." }, { status: 500 });
  }
}
