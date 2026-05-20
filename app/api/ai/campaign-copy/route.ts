import { NextResponse } from "next/server";
import { assertFakeAiProvider, fakeCampaignCopyVariants } from "@/lib/ai/fake-ai-provider";
import { campaignCopyRequestSchema } from "@/lib/validation/ai";

export async function POST(request: Request) {
  const payload = campaignCopyRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid campaign copy payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    assertFakeAiProvider();
    return NextResponse.json(fakeCampaignCopyVariants(payload.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI provider blocked." }, { status: 403 });
  }
}
