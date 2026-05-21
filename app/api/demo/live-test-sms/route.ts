import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { getLiveTestSmsStatus, sendLiveTestSms } from "@/lib/messaging/live-test-sms";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

export async function GET() {
  return NextResponse.json({
    liveTestSms: getLiveTestSmsStatus()
  });
}

export async function POST(request: Request) {
  const payload = liveTestSmsSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid live test SMS payload.", issues: payload.error.flatten() }, { status: 400 });
  }

  const currentOrg = await getOrCreateCurrentOrg();

  try {
    const result = await sendLiveTestSms({
      orgId: currentOrg.orgId,
      actorUserId: currentOrg.userId,
      to: payload.data.to,
      body: payload.data.body,
      confirmation: payload.data.confirmation
    });

    return NextResponse.json(result, { status: result.sent ? 201 : 403 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live test SMS failed." },
      { status: 502 }
    );
  }
}
