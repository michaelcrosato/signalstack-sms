import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { resolveAiMessages } from "@/lib/ai/conversation-context";
import { assertFakeAiProvider, fakeConversationSummary } from "@/lib/ai/fake-ai-provider";
import { recordFakeAiUsage } from "@/lib/ai/usage";
import { conversationAiRequestSchema } from "@/lib/validation/ai";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = conversationAiRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid conversation summary payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    assertFakeAiProvider();
    const messages = await resolveAiMessages(currentOrg.orgId, payload.data);
    if (!messages) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    const response = fakeConversationSummary(messages);
    await recordFakeAiUsage(currentOrg.orgId, "conversation-summary");
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI provider blocked." }, { status: 403 });
  }
}
