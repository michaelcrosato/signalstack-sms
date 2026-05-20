import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { resolveAiMessages } from "@/lib/ai/conversation-context";
import { assertFakeAiProvider, fakeLeadQualification } from "@/lib/ai/fake-ai-provider";
import { conversationAiRequestSchema } from "@/lib/validation/ai";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = conversationAiRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid lead qualification payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    assertFakeAiProvider();
    const messages = await resolveAiMessages(currentOrg.orgId, payload.data);
    if (!messages) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    return NextResponse.json(fakeLeadQualification(messages));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI provider blocked." }, { status: 403 });
  }
}
