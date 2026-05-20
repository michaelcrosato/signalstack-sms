import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { createConversationInboundMessage, listConversationMessages } from "@/lib/db/repositories/inbox";
import { conversationMessageCreateSchema } from "@/lib/validation/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const messages = await listConversationMessages(currentOrg.orgId, conversationId);

  if (!messages) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ messages });
}

export async function POST(request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const payload = conversationMessageCreateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid message payload.", issues: payload.error.issues }, { status: 400 });
  }

  const result = await createConversationInboundMessage(currentOrg.orgId, conversationId, payload.data);
  if (!result) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json(result, { status: 201 });
}
