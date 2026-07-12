import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getLiveTestSmsStatus, sendLiveTestSms } from "@/lib/messaging/live-test-sms";
import { liveTestSmsSchema } from "@/lib/validation/live-test-sms";

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }

  return NextResponse.json({
    liveTestSms: getLiveTestSmsStatus()
  });
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
  const payload = liveTestSmsSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid live test SMS payload.", issues: payload.error.flatten() }, { status: 400 });
  }

  try {
    const result = await sendLiveTestSms({
      orgId: currentOrg.orgId,
      actorUserId: currentOrg.userId,
      requestId: payload.data.requestId,
      to: payload.data.to,
      body: payload.data.body,
      confirmation: payload.data.confirmation,
      operatorToken: payload.data.operatorToken
    });

    let responseStatus = 403;
    if (result.sent) {
      responseStatus = result.duplicate ? 200 : 201;
    } else if ("conflict" in result) {
      responseStatus = 409;
    } else if ("pending" in result) {
      responseStatus = 202;
    } else if ("failed" in result) {
      responseStatus = 502;
    }
    return NextResponse.json(result, { status: responseStatus });
  } catch {
    return NextResponse.json({ error: "Live test SMS failed." }, { status: 502 });
  }
}
