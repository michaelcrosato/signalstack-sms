import { withTenantTransaction } from "@/lib/db/tenant-context";
import { orgWhere } from "@/lib/db/tenant";
import type { AiMessage } from "@/lib/ai/fake-ai-provider";
import type { ConversationAiRequest } from "@/lib/validation/ai";

export async function resolveAiMessages(orgId: string, input: ConversationAiRequest): Promise<AiMessage[] | null> {
  if (!input.conversationId) {
    return input.messages;
  }

  return withTenantTransaction({ orgId }, async (tx) => {
    const conversation = await tx.conversation.findFirst({
      where: orgWhere(orgId, { id: input.conversationId }),
      select: { id: true }
    });
    if (!conversation) {
      return null;
    }

    const messages = await tx.message.findMany({
      where: { orgId, conversationId: input.conversationId },
      orderBy: { createdAt: "asc" },
      select: { direction: true, body: true }
    });

    return messages;
  });
}
