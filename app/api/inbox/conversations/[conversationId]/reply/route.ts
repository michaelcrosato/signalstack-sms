import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { createConversationOutboundReply } from "@/lib/db/repositories/inbox";
import { conversationReplyCreateSchema } from "@/lib/validation/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, { params }: ConversationParams) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { conversationId } = await params;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = conversationReplyCreateSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid reply payload.", issues: payload.error.issues }, { status: 400 });
  }

  const result = await createConversationOutboundReply(currentOrg.orgId, conversationId, payload.data);

  if (!result) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  if (result.blocked) {
    return NextResponse.json(
      { error: "Reply blocked by consent rules.", reasons: result.reasons },
      { status: 422 }
    );
  }

  if ("conflict" in result) {
    return NextResponse.json(
      { error: "The reply request ID was already used for different message content." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { message: result.message, deduped: result.deduped },
    {
      status: result.deduped ? 200 : 201,
      headers: { Location: `/api/v1/messages/${result.message.id}` }
    }
  );
}
