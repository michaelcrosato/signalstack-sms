import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  ConsentStatus,
  ConversationStatus,
  MessageApplicationStatus,
  MessageAttemptStatus,
  MessageTransport,
  ProviderAccountStatus,
  ProviderPhoneNumberStatus,
  type Message,
  type Prisma
} from "@prisma/client";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { dummyProvider } from "@/lib/messaging/provider/dummy-provider";
import { readApiKeyPepper } from "@/lib/public-api/api-key-crypto";
import { requireIdempotencyKey } from "@/lib/public-api/idempotency";

const E164_PATTERN = /^\+[1-9]\d{4,14}$/;
const BROWSER_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DirectMessageRoute =
  | "public_direct"
  | "public_conversation_reply"
  | "browser_inbox_reply";

export type DirectMessageIdentity =
  | Readonly<{
      kind: "public_api";
      credentialId: string;
      idempotencyKey: string;
    }>
  | Readonly<{
      kind: "browser_inbox";
      requestId: string;
    }>;

export type DirectMessageReservationInput = Readonly<{
  orgId: string;
  route: DirectMessageRoute;
  identity: DirectMessageIdentity;
  transport: MessageTransport;
  contactId?: string;
  conversationId?: string;
  body: string;
  mediaUrls?: readonly string[];
}>;

export type DirectMessageReservationResult =
  | Readonly<{ ok: true; message: Message; deduped: boolean }>
  | Readonly<{ ok: false; kind: "not_found" }>
  | Readonly<{ ok: false; kind: "blocked"; reasons: readonly string[] }>
  | Readonly<{ ok: false; kind: "conflict" }>;

export type DirectMessageReservationDependencies = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  randomId?: () => string;
}>;

/**
 * Reserve one direct outbound message inside the caller's tenant transaction. Twilio is never
 * invoked here. The deterministic dummy adapter may finalize inside this transaction because it
 * has no network or external effect.
 */
export async function reserveDirectMessage(
  tx: Prisma.TransactionClient,
  input: DirectMessageReservationInput,
  dependencies: DirectMessageReservationDependencies = {}
): Promise<DirectMessageReservationResult> {
  const environment = dependencies.environment ?? process.env;
  const now = dependencies.now?.() ?? new Date();
  const randomId = dependencies.randomId ?? randomUUID;
  const normalized = normalizeInput(input);
  const pepper = readApiKeyPepper(environment);
  const domainIdempotencyKey = deriveDomainIdempotencyKey(normalized, pepper);

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockKey(domainIdempotencyKey)})`;

  const existing = await tx.message.findUnique({
    where: {
      orgId_idempotencyKey: {
        orgId: normalized.orgId,
        idempotencyKey: domainIdempotencyKey
      }
    }
  });
  if (existing) {
    if (!existing.destination || !existing.requestFingerprint) {
      return Object.freeze({ ok: false, kind: "conflict" });
    }
    const replayFingerprint = fingerprintRequest(
      {
        ...normalized,
        contactId: normalized.contactId ?? existing.contactId ?? undefined
      },
      existing.destination,
      pepper
    );
    if (existing.requestFingerprint !== replayFingerprint) {
      return Object.freeze({ ok: false, kind: "conflict" });
    }
    return Object.freeze({ ok: true, message: existing, deduped: true });
  }

  const relation = await resolveRecipientRelation(tx, normalized);
  if (!relation.ok) {
    return relation.result;
  }
  const { contact } = relation;
  const policyReasons = acceptancePolicyReasons(normalized.route, contact);
  if (policyReasons.length > 0) {
    return Object.freeze({ ok: false, kind: "blocked", reasons: Object.freeze(policyReasons) });
  }

  const providerBinding = await resolveProviderBinding(tx, normalized, contact.phone);
  if (!providerBinding.ok) {
    return Object.freeze({ ok: false, kind: "blocked", reasons: providerBinding.reasons });
  }
  const requestFingerprint = fingerprintRequest(
    { ...normalized, contactId: contact.id },
    contact.phone,
    pepper
  );
  const createdConversation = relation.conversation === null;
  const conversation = relation.conversation ?? await tx.conversation.create({
    data: { orgId: normalized.orgId, contactId: contact.id, status: ConversationStatus.OPEN }
  });

  let message = await tx.message.create({
    data: {
      orgId: normalized.orgId,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      body: normalized.body,
      applicationStatus: MessageApplicationStatus.ACCEPTED,
      transport: normalized.transport,
      destination: contact.phone,
      mediaUrls: [...normalized.mediaUrls],
      requestFingerprint,
      acceptedAt: now,
      attemptCount: 1,
      idempotencyKey: domainIdempotencyKey,
      createdAt: now
    }
  });
  const attempt = await tx.messageAttempt.create({
    data: {
      orgId: normalized.orgId,
      messageId: message.id,
      attemptNumber: 1,
      status: MessageAttemptStatus.QUEUED,
      transport: normalized.transport,
      dueAt: now,
      providerAccountId: providerBinding.providerAccountId,
      providerPhoneNumberId: providerBinding.providerPhoneNumberId,
      destination: contact.phone,
      body: normalized.body,
      mediaUrls: [...normalized.mediaUrls],
      requestFingerprint,
      callbackCorrelationId: randomId(),
      createdAt: now
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

  if (createdConversation) {
    await enqueueCustomerWebhookEvent(tx, {
      orgId: normalized.orgId,
      deduplicationKey: `conversation.created:${conversation.id}`,
      type: "conversation.created",
      aggregateType: "conversation",
      aggregateId: conversation.id,
      data: { conversationId: conversation.id, contactId: contact.id, status: "OPEN" }
    });
  }
  await enqueueCustomerWebhookEvent(tx, {
    orgId: normalized.orgId,
    deduplicationKey: `message.accepted:${message.id}`,
    type: "message.accepted",
    aggregateType: "message",
    aggregateId: message.id,
    data: {
      messageId: message.id,
      contactId: contact.id,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      applicationStatus: MessageApplicationStatus.ACCEPTED,
      transport: normalized.transport.toLowerCase()
    }
  });

  if (normalized.transport === MessageTransport.DUMMY) {
    const providerResult = await dummyProvider.send({
      to: contact.phone,
      from: "demo-signalstack",
      body: normalized.body,
      orgId: normalized.orgId,
      idempotencyKey: domainIdempotencyKey
    });
    await tx.messageAttempt.update({
      where: { id: attempt.id },
      data: {
        status: MessageAttemptStatus.SUCCEEDED,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.status,
        completedAt: now
      }
    });
    message = await tx.message.update({
      where: { id: message.id },
      data: {
        applicationStatus: MessageApplicationStatus.SENT,
        providerMessageId: providerResult.providerMessageId,
        providerStatus: providerResult.status,
        sentAt: now
      }
    });
    await enqueueCustomerWebhookEvent(tx, {
      orgId: normalized.orgId,
      deduplicationKey: `message.status.updated:${message.id}:sent`,
      type: "message.status.updated",
      aggregateType: "message",
      aggregateId: message.id,
      data: {
        messageId: message.id,
        contactId: contact.id,
        conversationId: conversation.id,
        status: "sent",
        providerStatus: providerResult.status,
        mode: "dummy"
      }
    });
  }

  if (!createdConversation) {
    await enqueueCustomerWebhookEvent(tx, {
      orgId: normalized.orgId,
      deduplicationKey: conversationUpdatedDeduplicationKey(conversation.id, message.id),
      type: "conversation.updated",
      aggregateType: "conversation",
      aggregateId: conversation.id,
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        messageId: message.id,
        status: "OPEN"
      }
    });
  }

  return Object.freeze({ ok: true, message, deduped: false });
}

export function resolveDirectMessageTransport(
  environment: Readonly<Record<string, string | undefined>> = process.env
): MessageTransport | null {
  const provider = environment.MESSAGING_PROVIDER ?? "dummy";
  if (provider === "dummy") return MessageTransport.DUMMY;
  if (provider === "twilio") return MessageTransport.TWILIO;
  return null;
}

type NormalizedInput = Readonly<{
  orgId: string;
  route: DirectMessageRoute;
  identity: DirectMessageIdentity;
  transport: MessageTransport;
  contactId?: string;
  conversationId?: string;
  body: string;
  mediaUrls: readonly string[];
}>;

function normalizeInput(input: DirectMessageReservationInput): NormalizedInput {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 1_600) {
    throw new RangeError("Direct message body is invalid.");
  }
  const mediaUrls = (input.mediaUrls ?? []).map((value) => normalizeMediaUrl(value));
  if (mediaUrls.length > 10 || new Set(mediaUrls).size !== mediaUrls.length) {
    throw new RangeError("Direct message media URLs are invalid.");
  }
  if (input.identity.kind === "public_api") {
    requireIdempotencyKey(input.identity.idempotencyKey);
    if (!input.identity.credentialId) throw new RangeError("Public API credential identity is invalid.");
  } else if (!BROWSER_REQUEST_ID_PATTERN.test(input.identity.requestId)) {
    throw new RangeError("Browser reply request ID is invalid.");
  }
  if (!input.orgId || (!input.contactId && !input.conversationId)) {
    throw new RangeError("Direct message tenant or recipient identity is invalid.");
  }
  return Object.freeze({
    ...input,
    body,
    mediaUrls: Object.freeze(mediaUrls)
  });
}

function normalizeMediaUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new RangeError("Direct message media URLs must use HTTPS without credentials.");
  }
  return url.toString();
}

function deriveDomainIdempotencyKey(input: NormalizedInput, pepper: string): string {
  const identity =
    input.identity.kind === "public_api"
      ? ["public_api", input.orgId, input.identity.credentialId, input.identity.idempotencyKey]
      : ["browser_inbox", input.orgId, input.identity.requestId];
  const digest = createHmac("sha256", pepper)
    .update("signalstack/direct-message-idempotency/v1\0", "utf8")
    .update(JSON.stringify(identity), "utf8")
    .digest("base64url");
  return `direct:v1:${digest}`;
}

function fingerprintRequest(input: NormalizedInput, destination: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update("signalstack/direct-message-request/v1\0", "utf8")
    .update(
      JSON.stringify([
        input.route,
        "OUTBOUND",
        input.contactId ?? null,
        input.conversationId ?? null,
        destination,
        input.body,
        input.mediaUrls,
        input.transport
      ]),
      "utf8"
    )
    .digest("base64url");
}

function advisoryLockKey(identity: string): bigint {
  return createHash("sha256").update(identity, "utf8").digest().readBigInt64BE(0);
}

async function resolveRecipientRelation(tx: Prisma.TransactionClient, input: NormalizedInput) {
  const requestedConversation = input.conversationId
    ? await tx.conversation.findFirst({
        where: { orgId: input.orgId, id: input.conversationId },
        select: { id: true, contactId: true, status: true }
      })
    : null;
  if (input.conversationId && !requestedConversation) {
    return Object.freeze({ ok: false as const, result: Object.freeze({ ok: false as const, kind: "not_found" as const }) });
  }
  if (requestedConversation && !requestedConversation.contactId) {
    return Object.freeze({
      ok: false as const,
      result: Object.freeze({
        ok: false as const,
        kind: "blocked" as const,
        reasons: Object.freeze(["CONTACT_MISSING"])
      })
    });
  }
  if (
    requestedConversation &&
    input.contactId !== undefined &&
    requestedConversation.contactId !== input.contactId
  ) {
    return Object.freeze({ ok: false as const, result: Object.freeze({ ok: false as const, kind: "not_found" as const }) });
  }
  const contactId = input.contactId ?? requestedConversation?.contactId;
  if (!contactId) {
    return Object.freeze({
      ok: false as const,
      result: Object.freeze({ ok: false as const, kind: "blocked" as const, reasons: Object.freeze(["CONTACT_MISSING"]) })
    });
  }
  const contact = await tx.contact.findFirst({ where: { orgId: input.orgId, id: contactId } });
  if (!contact) {
    return Object.freeze({ ok: false as const, result: Object.freeze({ ok: false as const, kind: "not_found" as const }) });
  }
  if (!E164_PATTERN.test(contact.phone)) {
    return Object.freeze({
      ok: false as const,
      result: Object.freeze({ ok: false as const, kind: "blocked" as const, reasons: Object.freeze(["CONTACT_PHONE_INVALID"]) })
    });
  }
  if (requestedConversation) {
    return Object.freeze({ ok: true as const, contact, conversation: requestedConversation, createdConversation: false });
  }
  const existingConversation = await tx.conversation.findFirst({
    where: { orgId: input.orgId, contactId: contact.id, status: ConversationStatus.OPEN },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
  });
  if (existingConversation) {
    return Object.freeze({ ok: true as const, contact, conversation: existingConversation, createdConversation: false });
  }
  return Object.freeze({ ok: true as const, contact, conversation: null, createdConversation: true });
}

function acceptancePolicyReasons(
  route: DirectMessageRoute,
  contact: Readonly<{
    archivedAt: Date | null;
    optedOutAt: Date | null;
    consentStatus: ConsentStatus;
  }>
): string[] {
  const reasons: string[] = [];
  if (contact.archivedAt) reasons.push("CONTACT_ARCHIVED");
  if (contact.optedOutAt || contact.consentStatus === ConsentStatus.OPTED_OUT) {
    reasons.push("CONTACT_OPTED_OUT");
  }
  if (route !== "browser_inbox_reply" && contact.consentStatus !== ConsentStatus.OPTED_IN) {
    reasons.push("CONTACT_NOT_OPTED_IN");
  }
  return reasons;
}

async function resolveProviderBinding(
  tx: Prisma.TransactionClient,
  input: NormalizedInput,
  destination: string
): Promise<
  | Readonly<{ ok: true; providerAccountId: string | null; providerPhoneNumberId: string | null }>
  | Readonly<{ ok: false; reasons: readonly string[] }>
> {
  if (input.transport === MessageTransport.DUMMY) {
    return Object.freeze({ ok: true, providerAccountId: null, providerPhoneNumberId: null });
  }
  if (input.transport !== MessageTransport.TWILIO || !E164_PATTERN.test(destination)) {
    return Object.freeze({ ok: false, reasons: Object.freeze(["TRANSPORT_NOT_AVAILABLE"]) });
  }
  const account = await tx.providerAccount.findFirst({
    where: {
      orgId: input.orgId,
      provider: "twilio",
      status: ProviderAccountStatus.VERIFIED,
      revokedAt: null,
      isDefault: true
    }
  });
  if (!account) {
    return Object.freeze({ ok: false, reasons: Object.freeze(["TWILIO_ACCOUNT_NOT_READY"]) });
  }
  const sender = await tx.providerPhoneNumber.findFirst({
    where: {
      orgId: input.orgId,
      provider: "twilio",
      providerAccountId: account.id,
      status: ProviderPhoneNumberStatus.VERIFIED,
      disabledAt: null,
      isDefault: true
    }
  });
  if (!sender) {
    return Object.freeze({ ok: false, reasons: Object.freeze(["TWILIO_SENDER_NOT_READY"]) });
  }
  const capability = input.mediaUrls.length > 0 ? "mms" : "sms";
  if (!providerCapabilities(sender.capabilities).has(capability)) {
    return Object.freeze({
      ok: false,
      reasons: Object.freeze([capability === "mms" ? "TWILIO_SENDER_MMS_UNAVAILABLE" : "TWILIO_SENDER_SMS_UNAVAILABLE"])
    });
  }
  return Object.freeze({ ok: true, providerAccountId: account.id, providerPhoneNumberId: sender.id });
}

function providerCapabilities(value: Prisma.JsonValue): ReadonlySet<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase())
      : []
  );
}

function conversationUpdatedDeduplicationKey(conversationId: string, messageId: string): string {
  const digest = createHash("sha256")
    .update(
      `signalstack/public-conversation-event/v1\0conversation.updated\0${conversationId}\0${messageId}`,
      "utf8"
    )
    .digest("base64url");
  return `api:conversation.updated:${digest}`;
}
