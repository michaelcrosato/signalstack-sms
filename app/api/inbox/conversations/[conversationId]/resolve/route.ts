import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { setConversationResolved } from "@/lib/db/repositories/inbox";
import { conversationResolveSchema } from "@/lib/validation/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return roleResponse;
  }

  const payload = conversationResolveSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid resolve payload.", issues: payload.error.issues }, { status: 400 });
  }

  const conversation = await setConversationResolved(currentOrg.orgId, conversationId, payload.data);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
