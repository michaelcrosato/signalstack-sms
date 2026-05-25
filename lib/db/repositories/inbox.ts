import { ConsentStatus, ConversationStatus, type Prisma } from "@prisma/client";
import { classifyInboundKeyword } from "@/lib/compliance/opt-out";
import { prisma } from "@/lib/db/prisma";
import { orgWhere } from "@/lib/db/tenant";
import type {
  ConversationAssignInput,
  ConversationMessageCreateInput,
  ConversationNoteCreateInput,
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

    if (keywordAction === "OPT_OUT") {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          consentStatus: ConsentStatus.OPTED_OUT,
          optedOutAt: new Date()
        }
      });
    }

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

    return {
      conversation: savedConversation,
      message,
      keywordAction
    };
  });
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
    if (contact && keywordAction === "OPT_OUT") {
      await tx.contact.update({
        where: { id: contact.id },
        data: { consentStatus: ConsentStatus.OPTED_OUT, optedOutAt: new Date() }
      });
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

    return { message, keywordAction };
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
