import { ConsentStatus, ConversationStatus, type Message, type Prisma } from "@prisma/client";
import {
  hasAnyConsentEvidence,
  hasCompleteConsentEvidence
} from "@/lib/compliance/consent-evidence";
import { classifyInboundKeyword, type InboundKeywordAction } from "@/lib/compliance/opt-out";
import { orgWhere } from "@/lib/db/tenant";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { resolveAiProvider } from "@/lib/ai/provider";
import { logger } from "@/lib/observability/logger";
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
  return withTenantTransaction({ orgId }, (tx) => tx.conversation.findMany({
    where: { orgId },
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }, { updatedAt: "desc" }],
    include: conversationInclude
  }));
}

export async function getConversation(orgId: string, conversationId: string) {
  return withTenantTransaction({ orgId }, (tx) => tx.conversation.findFirst({
    where: orgWhere(orgId, { id: conversationId }),
    include: conversationInclude
  }));
}

export async function listConversationMessages(orgId: string, conversationId: string) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    return tx.message.findMany({
      where: { orgId, conversationId },
      orderBy: { createdAt: "asc" }
    });
  });
}

type KeywordAutoReplyIntent = Readonly<{
  contactId: string;
  conversationId: string;
  phone: string;
  body: string;
  idempotencyKey: string;
}>;

async function applyInboundKeyword(
  tx: Prisma.TransactionClient,
  orgId: string,
  contact: {
    id: string;
    phone: string;
    consentStatus: ConsentStatus;
    consentCapturedAt: Date | null;
    consentMethod: string | null;
    consentDisclosure: string | null;
  },
  conversationId: string,
  keywordAction: InboundKeywordAction,
  inboundIdempotencyKey: string,
  options: { sendAutoReply?: boolean } = {}
): Promise<KeywordAutoReplyIntent | null> {
  if (keywordAction === "OPT_OUT") {
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        consentStatus: ConsentStatus.OPTED_OUT,
        optedOutAt: new Date()
      }
    });

    if (options.sendAutoReply === false) {
      return null;
    }

    const body = "You have successfully opted out. You will no longer receive messages. Reply START to opt back in.";
    const idempotencyKey = `opt-out-confirm:${inboundIdempotencyKey}`;
    return { contactId: contact.id, conversationId, phone: contact.phone, body, idempotencyKey };
  } else if (keywordAction === "OPT_IN") {
    if (
      contact.consentStatus === ConsentStatus.PENDING_DOUBLE_OPT_IN ||
      contact.consentStatus === ConsentStatus.UNKNOWN ||
      contact.consentStatus === ConsentStatus.OPTED_OUT
    ) {
      const existingEvidenceIsComplete = hasCompleteConsentEvidence(contact);
      if (!existingEvidenceIsComplete && hasAnyConsentEvidence(contact)) {
        return null;
      }

      const consentEvidence = existingEvidenceIsComplete
        ? {}
        : {
            consentCapturedAt: new Date(),
            consentMethod: "SMS",
            consentDisclosure: "Contact replied with opt-in keyword to confirm subscription"
          };

      const updateResult = await tx.contact.updateMany({
        where: {
          orgId,
          id: contact.id,
          ...(existingEvidenceIsComplete
            ? {}
            : {
                consentCapturedAt: null,
                consentMethod: null,
                consentDisclosure: null
              })
        },
        data: {
          consentStatus: ConsentStatus.OPTED_IN,
          optedOutAt: null,
          ...consentEvidence
        }
      });
      if (updateResult.count !== 1) {
        return null;
      }

      if (options.sendAutoReply === false) {
        return null;
      }

      const body = "Thank you! You have successfully confirmed your subscription and opted in.";
      const idempotencyKey = `opt-in-confirm:${inboundIdempotencyKey}`;
      return { contactId: contact.id, conversationId, phone: contact.phone, body, idempotencyKey };
    }
  }

  return null;
}

async function deliverKeywordAutoReply(orgId: string, intent: KeywordAutoReplyIntent): Promise<void> {
  const providerResult = await dummyProvider.send({
    to: intent.phone,
    from: "demo-signalstack",
    body: intent.body,
    orgId,
    idempotencyKey: intent.idempotencyKey
  });

  await withTenantTransaction({ orgId }, async (tx) => {
    const message = await tx.message.upsert({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey: intent.idempotencyKey } },
      update: {},
      create: {
        orgId,
        contactId: intent.contactId,
        conversationId: intent.conversationId,
        direction: "OUTBOUND",
        body: intent.body,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.status,
        idempotencyKey: intent.idempotencyKey
      }
    });

    await tx.conversation.update({
      where: { id: intent.conversationId },
      data: { lastMessageAt: message.createdAt }
    });
  });
}

export async function processInboundKeywordsAndAutoReply(
  orgId: string,
  contact: Parameters<typeof applyInboundKeyword>[2],
  conversationId: string,
  keywordAction: InboundKeywordAction,
  inboundIdempotencyKey: string,
  options: { sendAutoReply?: boolean } = {}
): Promise<void> {
  const intent = await withTenantTransaction({ orgId }, (tx) =>
    applyInboundKeyword(tx, orgId, contact, conversationId, keywordAction, inboundIdempotencyKey, options)
  );
  if (intent) {
    await deliverKeywordAutoReply(orgId, intent);
  }
}

export async function createDemoInboundMessage(
  orgId: string,
  input: InboundMessageInput,
  options: { analyzeSentiment?: boolean; sendKeywordAutoReply?: boolean } = {}
) {
  const transactionResult = await withTenantTransaction({ orgId }, async (tx) => {
    const explicitIdempotencyKey =
      input.idempotencyKey ?? (input.providerMessageId ? `demo-inbound:${orgId}:${input.providerMessageId}` : null);
    if (explicitIdempotencyKey) {
      const existing = await findExistingInboundMessage(tx, orgId, explicitIdempotencyKey);
      if (existing) {
        return {
          value: { ...existing, keywordAction: classifyInboundKeyword(existing.message.body) },
          shouldAnalyze: false,
          autoReply: null
        };
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

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.OPEN,
        lastMessageAt: message.createdAt,
        resolvedAt: null
      }
    });

    const autoReply = await applyInboundKeyword(
      tx,
      orgId,
      contact,
      conversation.id,
      keywordAction,
      idempotencyKey,
      { sendAutoReply: options.sendKeywordAutoReply }
    );

    const savedConversation = await tx.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: conversationInclude
    });

    return {
      value: {
        conversation: savedConversation,
        message,
        keywordAction
      },
      shouldAnalyze: true,
      autoReply
    };
  });

  if (transactionResult.autoReply) {
    await deliverKeywordAutoReply(orgId, transactionResult.autoReply);
  }

  if (
    options.analyzeSentiment !== false &&
    transactionResult.shouldAnalyze &&
    transactionResult.value.conversation
  ) {
    await triggerConversationSentimentAnalysis(orgId, transactionResult.value.conversation.id);
  }
  return transactionResult.value;
}

export async function triggerConversationSentimentAnalysis(orgId: string, conversationId: string) {
  try {
    const messages = await withTenantTransaction({ orgId }, (tx) => tx.message.findMany({
      where: { orgId, conversationId },
      orderBy: { createdAt: "asc" }
    }));
    if (messages.length === 0) return;

    const aiMessages = messages.map((message) => ({
      direction: message.direction,
      body: message.body
    }));

    const provider = resolveAiProvider();
    const result = await provider.analyzeConversationSentiment({ messages: aiMessages });

    await withTenantTransaction({ orgId }, (tx) => tx.conversation.updateMany({
      where: { id: conversationId, orgId },
      data: {
        sentiment: result.sentiment,
        category: result.category
      }
    }));
  } catch (error) {
    logger.error("conversation_sentiment_analysis_failed", {
      orgId,
      conversationId,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
}

export async function createConversationInboundMessage(
  orgId: string,
  conversationId: string,
  input: ConversationMessageCreateInput
) {
  const transactionResult = await withTenantTransaction({ orgId }, async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return { value: null, shouldAnalyze: false, autoReply: null };
    }

    if (input.idempotencyKey) {
      const existing = await findExistingInboundMessage(tx, orgId, input.idempotencyKey);
      if (existing) {
        return {
          value: { message: existing.message, keywordAction: classifyInboundKeyword(existing.message.body) },
          shouldAnalyze: false,
          autoReply: null
        };
      }
    }

    const keywordAction = classifyInboundKeyword(input.body);
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

    const contact = conversation.contactId
      ? await tx.contact.findFirst({ where: orgWhere(orgId, { id: conversation.contactId }) })
      : null;
    const autoReply = contact
      ? await applyInboundKeyword(
        tx,
        orgId,
        contact,
        conversationId,
        keywordAction,
        idempotencyKey
      )
      : null;

    return { value: { message, keywordAction }, shouldAnalyze: true, autoReply };
  });

  if (transactionResult.autoReply) {
    await deliverKeywordAutoReply(orgId, transactionResult.autoReply);
  }

  if (transactionResult.shouldAnalyze) {
    await triggerConversationSentimentAnalysis(orgId, conversationId);
  }
  return transactionResult.value;
}

export type OutboundReplyResult =
  | null
  | { blocked: true; reasons: string[] }
  | { blocked: false; message: Message; deduped: boolean };

type OutboundReplyPreparation =
  | { ready: false; result: OutboundReplyResult }
  | {
      ready: true;
      contactId: string;
      phone: string;
      idempotencyKey: string;
    };

// Demo-safe outbound reply: records a local OUTBOUND message via the dummy provider only — never a live
// send. Replying to an inbound conversation does not require OPTED_IN, but opt-out/STOP and archived
// contacts are blocked (no message row created), honoring the consent boundary the live hard gate enforces.
export async function createConversationOutboundReply(
  orgId: string,
  conversationId: string,
  input: ConversationReplyCreateInput
): Promise<OutboundReplyResult> {
  const preparation = await withTenantTransaction({ orgId }, async (tx): Promise<OutboundReplyPreparation> => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return { ready: false, result: null };
    }

    if (input.idempotencyKey) {
      const existing = await tx.message.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey: input.idempotencyKey } }
      });
      if (existing) {
        return { ready: false, result: { blocked: false, message: existing, deduped: true } };
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
      return { ready: false, result: { blocked: true, reasons } };
    }

    const idempotencyKey = input.idempotencyKey ?? `inbox-reply:${orgId}:${conversationId}:${Date.now()}`;
    return { ready: true, contactId: contact.id, phone: contact.phone, idempotencyKey };
  });

  if (!preparation.ready) {
    return preparation.result;
  }

  const providerResult = await dummyProvider.send({
    to: preparation.phone,
    from: "demo-signalstack",
    body: input.body,
    orgId,
    idempotencyKey: preparation.idempotencyKey
  });

  return withTenantTransaction({ orgId }, async (tx) => {
    const existing = await tx.message.findUnique({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey: preparation.idempotencyKey } }
    });
    if (existing) {
      return { blocked: false, message: existing, deduped: true };
    }

    const message = await tx.message.upsert({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey: preparation.idempotencyKey } },
      update: {},
      create: {
        orgId,
        contactId: preparation.contactId,
        conversationId,
        direction: "OUTBOUND",
        body: input.body,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.status,
        idempotencyKey: preparation.idempotencyKey
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
  return withTenantTransaction({ orgId }, async (tx) => {
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
  return withTenantTransaction({ orgId, userId: authorUserId }, async (tx) => {
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
  return withTenantTransaction({ orgId }, async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    return tx.internalNote.findMany({
      where: { orgId, conversationId },
      orderBy: { createdAt: "asc" },
      include: { author: true }
    });
  });
}

export async function setConversationResolved(
  orgId: string,
  conversationId: string,
  input: ConversationResolveInput
) {
  return withTenantTransaction({ orgId }, async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: orgWhere(orgId, { id: conversationId }) });
    if (!conversation) {
      return null;
    }

    return tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: input.resolved ? ConversationStatus.RESOLVED : ConversationStatus.OPEN,
        resolvedAt: input.resolved ? new Date() : null
      },
      include: conversationInclude
    });
  });
}
