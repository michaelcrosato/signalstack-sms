import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { scheduleCampaign } from "@/lib/db/repositories/campaigns";
import { enqueueScheduledCampaignBullMqJob } from "@/lib/queue/bullmq";
import { campaignScheduleSchema } from "@/lib/validation/campaigns";

type CampaignParams = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: Request, { params }: CampaignParams) {
  const [{ campaignId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const payload = campaignScheduleSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid schedule payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const queueJob = await scheduleCampaign(currentOrg.orgId, campaignId, new Date(payload.data.scheduledAt));
    if (!queueJob) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    await enqueueScheduledCampaignBullMqJob(queueJob);
    return NextResponse.json({ queueJob }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign schedule failed." }, { status: 409 });
  }
}
