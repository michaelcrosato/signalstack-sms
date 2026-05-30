import { ConsentStatus, ConversationStatus, type Prisma } from "@prisma/client";
import { classifyInboundKeyword, type InboundKeywordAction } from "@/lib/compliance/opt-out";
import { prisma } from "@/lib/db/prisma";
import { orgWhere } from "@/lib/db/tenant";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { resolveAiProvider } from "@/lib/ai/provider";
import type {
  ConversationAssignInput,
  ConversationMessageCreateInput,
  ConversationNoteCreateInput,
  ConversationReplyCreateInput,
  ConversationResolveInput,
  InboundMessageInput
} from "@/lib/validation/inbox";

const conversationInclude = {
  contact: true,
  assignedTo: true,
  messages: { orderBy: { createdAt: "desc" }, take: 5 },
  internalNotes: { orderBy: { createdAt: "desc" }, take: 5, include: { author: true } }
} satisfies Prisma.ConversationInclude;

async function findExistingInboundMessage(
  tx: Prisma.TransactionClient,
  orgId: string,
  idempotencyKey: string
) {
  const existing = await tx.message.findUnique({
    where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
    include: { conversation: { include: conversationInclude } }
  });

  if (!existing) {
    return null;
  }

  const { conversation, ...message } = existing;
  return { conversation, message };
}

export async function listConversations(orgId: string) {
  return prisma.conversation.findMany({
    where: { orgId },
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }, { updatedAt: "desc" }],
    include: conversationInclude
  });
}

export async function getConversation(orgId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: orgWhere(orgId, { id: conversationId }),
    include: conversationInclude
  });
}

export async function listConversationMessages(orgId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
  if (!conversation) {
    return null;
  }

  return prisma.message.findMany({
    where: { orgId, conversationId },
    orderBy: { createdAt: "asc" }
  });
}

export async function processInboundKeywordsAndAutoReply(
  tx: Prisma.TransactionClient,
  orgId: string,
  contact: { id: string; phone: string; consentStatus: ConsentStatus },
  conversationId: string,
  keywordAction: InboundKeywordAction
) {
  if (keywordAction === "OPT_OUT") {
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date()
      }
    });

    const body = "You have successfully opted out. You will no longer receive messages. Reply START to opt back in.";
    const idempotencyKey = `opt-out-confirm:${orgId}:${contact.id}:${Date.now()}`;

    const providerResult = await dummyProvider.send({
      to: contact.phone,
      from: "demo-signalstack",
      body,
      orgId,
      idempotencyKey
    });

    const message = await tx.message.create({
      data: {
        orgId,
        contactId: contact.id,
        conversationId,
        direction: "OUTBOUND",
        body,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.status,
        idempotencyKey
      }
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt }
    });
  } else if (keywordAction === "OPT_IN") {
    if (
      contact.consentStatus === ConsentStatus.PENDING_DOUBLE_OPT_IN ||
      contact.consentStatus === ConsentStatus.UNKNOWN ||
      contact.consentStatus === ConsentStatus.OPTED_OUT
    ) {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          consentStatus: ConsentStatus.OPTED_IN,
          optedOutAt: null,
          consentCapturedAt: new Date(),
          consentMethod: "SMS",
          consentDisclosure: "Contact replied with opt-in keyword to confirm subscription"
        }
      });

      const body = "Thank you! You have successfully confirmed your subscription and opted in.";
      const idempotencyKey = `opt-in-confirm:${orgId}:${contact.id}:${Date.now()}`;

      const providerResult = await dummyProvider.send({
        to: contact.phone,
        from: "demo-signalstack",
        body,
        orgId,
        idempotencyKey
      });

      const message = await tx.message.create({
        data: {
          orgId,
          contactId: contact.id,
          conversationId,
          direction: "OUTBOUND",
          body,
          providerMessageId: providerResult.providerMessageId,
          providerStatus: providerResult.status,
          idempotencyKey
        }
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt }
      });
    }
  }
}

export async function createDemoInboundMessage(orgId: string, input: InboundMessageInput) {
  return prisma.$transaction(async (tx) => {
    const explicitIdempotencyKey =
      input.idempotencyKey ?? (input.providerMessageId ? `demo-inbound:${orgId}:${input.providerMessageId}` : null);
    if (explicitIdempotencyKey) {
      const existing = await findExistingInboundMessage(tx, orgId, explicitIdempotencyKey);
      if (existing) {
        return { ...existing, keywordAction: classifyInboundKeyword(existing.message.body) };
      }
    }

    const keywordAction = classifyInboundKeyword(input.body);
    const contact = await tx.contact.upsert({
      where: { orgId_phone: { orgId, phone: input.phone } },
      update: {},
      create: {
        orgId,
        phone: input.phone,
        consentStatus: ConsentStatus.UNKNOWN,
        source: "demo_inbound"
      }
    });

    const existingConversation = await tx.conversation.findFirst({
      where: { orgId, contactId: contact.id, status: ConversationStatus.OPEN },
      orderBy: { updatedAt: "desc" }
    });

    const conversation =
      existingConversation ??
      (await tx.conversation.create({
        data: {
          orgId,
          contactId: contact.id,
          status: ConversationStatus.OPEN
        }
      }));

    await processInboundKeywordsAndAutoReply(tx, orgId, contact, conversation.id, keywordAction);

    const idempotencyKey =
      explicitIdempotencyKey ??
      `demo-inbound:${orgId}:${input.providerMessageId ?? `${contact.id}:${Date.now()}`}`;

    const message = await tx.message.upsert({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      update: {},
      create: {
        orgId,
        contactId: contact.id,
        conversationId: conversation.id,
        direction: "INBOUND",
        body: input.body,
        providerMessageId: input.providerMessageId,
        idempotencyKey
      }
    });

    const savedConversation = await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.OPEN,
        lastMessageAt: message.createdAt,
        resolvedAt: null
      },
      include: conversationInclude
    });

    triggerConversationSentimentAnalysis(orgId, conversation.id);

    return {
      conversation: savedConversation,
      message,
      keywordAction
    };
  });
}

export function triggerConversationSentimentAnalysis(orgId: string, conversationId: string) {
  setTimeout(async () => {
    try {
      const messages = await prisma.message.findMany({
        where: { orgId, conversationId },
        orderBy: { createdAt: "asc" }
      });
      if (messages.length === 0) return;

      const aiMessages = messages.map((m) => ({
        direction: m.direction,
        body: m.body
      }));

      const provider = resolveAiProvider();
      const result = await provider.analyzeConversationSentiment({ messages: aiMessages });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          sentiment: result.sentiment,
          category: result.category
        }
      });
    } catch (error) {
      console.error("[SentimentAnalysis] Failed:", error);
    }
  }, 10);
}

export async function createConversationInboundMessage(
  orgId: string,
  conversationId: string,
  input: ConversationMessageCreateInput
) {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    if (input.idempotencyKey) {
      const existing = await findExistingInboundMessage(tx, orgId, input.idempotencyKey);
      if (existing) {
        return { message: existing.message, keywordAction: classifyInboundKeyword(existing.message.body) };
      }
    }

    const keywordAction = classifyInboundKeyword(input.body);
    const contact = conversation.contactId
      ? await tx.contact.findFirst({ where: orgWhere(orgId, { id: conversation.contactId }) })
      : null;
    if (contact) {
      await processInboundKeywordsAndAutoReply(tx, orgId, contact, conversationId, keywordAction);
    }

    const idempotencyKey =
      input.idempotencyKey ?? `demo-conversation-inbound:${orgId}:${conversationId}:${Date.now()}`;
    const message = await tx.message.upsert({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      update: {},
      create: {
        orgId,
        contactId: conversation.contactId,
        conversationId,
        direction: "INBOUND",
        body: input.body,
        providerMessageId: input.providerMessageId,
        idempotencyKey
      }
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.OPEN, lastMessageAt: message.createdAt, resolvedAt: null }
    });

    triggerConversationSentimentAnalysis(orgId, conversationId);

    return { message, keywordAction };
  });
}

export type OutboundReplyResult =
  | null
  | { blocked: true; reasons: string[] }
  | { blocked: false; message: Awaited<ReturnType<typeof prisma.message.upsert>>; deduped: boolean };

// Demo-safe outbound reply: records a local OUTBOUND message via the dummy provider only — never a live
// send. Replying to an inbound conversation does not require OPTED_IN, but opt-out/STOP and archived
// contacts are blocked (no message row created), honoring the consent boundary the live hard gate enforces.
export async function createConversationOutboundReply(
  orgId: string,
  conversationId: string,
  input: ConversationReplyCreateInput
): Promise<OutboundReplyResult> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    if (input.idempotencyKey) {
      const existing = await tx.message.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey: input.idempotencyKey } }
      });
      if (existing) {
        return { blocked: false, message: existing, deduped: true };
      }
    }

    const contact = conversation.contactId
      ? await tx.contact.findFirst({ where: orgWhere(orgId, { id: conversation.contactId }) })
      : null;

    const reasons: string[] = [];
    if (!contact) {
      reasons.push("CONTACT_MISSING");
    } else {
      if (contact.archivedAt) {
        reasons.push("CONTACT_ARCHIVED");
      }
      if (contact.optedOutAt || contact.consentStatus === ConsentStatus.OPTED_OUT) {
        reasons.push("CONTACT_OPTED_OUT");
      }
    }
    if (reasons.length > 0 || !contact) {
      return { blocked: true, reasons };
    }

    const idempotencyKey = input.idempotencyKey ?? `inbox-reply:${orgId}:${conversationId}:${Date.now()}`;
    const providerResult = await dummyProvider.send({
      to: contact.phone,
      from: "demo-signalstack",
      body: input.body,
      orgId,
      idempotencyKey
    });

    const message = await tx.message.upsert({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      update: {},
      create: {
        orgId,
        contactId: conversation.contactId,
        conversationId,
        direction: "OUTBOUND",
        body: input.body,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.status,
        idempotencyKey
      }
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt }
    });

    return { blocked: false, message, deduped: false };
  });
}

export async function assignConversation(
  orgId: string,
  conversationId: string,
  input: ConversationAssignInput
) {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    if (input.assignedToUserId) {
      const membership = await tx.membership.findFirst({
        where: { orgId, userId: input.assignedToUserId, status: "ACTIVE" }
      });
      if (!membership) {
        throw new Error("Assigned user is not an active member of this organization.");
      }
    }

    return tx.conversation.update({
      where: { id: conversationId },
      data: {
        assignedToUserId: input.assignedToUserId ?? null,
        assignedAt: input.assignedToUserId ? new Date() : null
      },
      include: conversationInclude
    });
  });
}

export async function addConversationNote(
  orgId: string,
  conversationId: string,
  authorUserId: string,
  input: ConversationNoteCreateInput
) {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    return tx.internalNote.create({
      data: {
        orgId,
        conversationId,
        authorUserId,
        body: input.body
      },
      include: { author: true }
    });
  });
}

export async function listConversationNotes(orgId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
  if (!conversation) {
    return null;
  }

  return prisma.internalNote.findMany({
    where: { orgId, conversationId },
    orderBy: { createdAt: "asc" },
    include: { author: true }
  });
}

export async function setConversationResolved(
  orgId: string,
  conversationId: string,
  input: ConversationResolveInput
) {
  const conversation = await prisma.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
  if (!conversation) {
    return null;
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: input.resolved ? ConversationStatus.RESOLVED : ConversationStatus.OPEN,
      resolvedAt: input.resolved ? new Date() : null
    },
    include: conversationInclude
  });
}
