import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { assignConversation } from "@/lib/db/repositories/inbox";
import { conversationAssignSchema } from "@/lib/validation/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const payload = conversationAssignSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid assignment payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const conversation = await assignConversation(currentOrg.orgId, conversationId, payload.data);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Conversation assignment failed." },
      { status: 409 }
    );
  }
}
