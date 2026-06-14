import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { resolveAiMessages } from "@/lib/ai/conversation-context";
import { resolveAiProvider } from "@/lib/ai/provider";
import {
  aiDraftCapExceeded,
  countAiRequestsSince,
  recordFakeAiUsage,
  recordLiveAiUsage
} from "@/lib/ai/usage";
import { conversationAiRequestSchema } from "@/lib/validation/ai";

const CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.MEMBER);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = conversationAiRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid reply suggestion payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const provider = resolveAiProvider();
    const messages = await resolveAiMessages(currentOrg.orgId, payload.data);
    if (!messages) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    // Cost guard: only the gated live provider is capped; the free fake path is unbounded (demo-safe).
    if (provider.name === "live") {
      const usedInWindow = await countAiRequestsSince(currentOrg.orgId, new Date(Date.now() - CAP_WINDOW_MS));
      if (aiDraftCapExceeded(usedInWindow)) {
        return NextResponse.json({ error: "AI draft daily cap reached for this organization." }, { status: 429 });
      }
    }

    // Draft only — this endpoint never sends a message.
    const draft = await provider.generateReplyDraft({ messages, goal: payload.data.goal });

    if (provider.name === "live") {
      await recordLiveAiUsage(currentOrg.orgId, "reply-suggestion");
    } else {
      await recordFakeAiUsage(currentOrg.orgId, "reply-suggestion");
    }

    return NextResponse.json(draft);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI provider blocked." }, { status: 403 });
  }
}
