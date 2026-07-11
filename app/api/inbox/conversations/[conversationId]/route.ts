import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getConversation } from "@/lib/db/repositories/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, { params }: ConversationParams) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { conversationId } = await params;
  const conversation = await getConversation(currentOrg.orgId, conversationId);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
