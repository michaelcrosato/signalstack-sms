import type { Prisma } from "@prisma/client";
import { orgWhere } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant-context";

export type PersistedLeadQualification = {
  score: number;
  stage: string;
};

// SPEC-008: persist the latest lead qualification on the contact behind a conversation, tenant-scoped.
// Returns false when the conversation is not found for this org (fail-safe — writes nothing). The only
// mutation is the contact's lead fields; it never touches consent, sends a message, or calls a provider.
export async function persistContactLeadQualification(
  orgId: string,
  conversationId: string,
  result: PersistedLeadQualification,
  tx?: Prisma.TransactionClient
): Promise<boolean> {
  const execute = async (client: Prisma.TransactionClient): Promise<boolean> => {
    const conversation = await client.conversation.findFirst({
      where: orgWhere(orgId, { id: conversationId }),
      select: { contactId: true }
    });
    if (!conversation || !conversation.contactId) {
      return false;
    }

    await client.contact.updateMany({
      where: { id: conversation.contactId, orgId },
      data: {
        leadScore: result.score,
        leadStage: result.stage,
        leadQualifiedAt: new Date()
      }
    });

    return true;
  };

  return tx ? execute(tx) : withTenantTransaction({ orgId }, execute);
}
