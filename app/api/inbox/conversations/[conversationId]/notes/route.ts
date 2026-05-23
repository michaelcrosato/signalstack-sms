import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { addConversationNote, listConversationNotes } from "@/lib/db/repositories/inbox";
import { conversationNoteCreateSchema } from "@/lib/validation/inbox";

type ConversationParams = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const notes = await listConversationNotes(currentOrg.orgId, conversationId);

  if (!notes) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ notes });
}

export async function POST(request: Request, { params }: ConversationParams) {
  const [{ conversationId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = conversationNoteCreateSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid note payload.", issues: payload.error.issues }, { status: 400 });
  }

  const note = await addConversationNote(currentOrg.orgId, conversationId, currentOrg.userId, payload.data);
  if (!note) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ note }, { status: 201 });
}
