import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createConversationOutboundReply } from "@/lib/db/repositories/inbox";
import { conversationReplyCreateSchema } from "@/lib/validation/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
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

  return NextResponse.json(
    { message: result.message, deduped: result.deduped },
    { status: result.deduped ? 200 : 201 }
  );
}
