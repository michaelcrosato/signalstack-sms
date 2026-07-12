import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getOrganization } from "@/app/api/v1/organization/route";
import { POST as createContact } from "@/app/api/v1/contacts/route";
import { GET as getContact } from "@/app/api/v1/contacts/[contactId]/route";
import { POST as createMessage } from "@/app/api/v1/messages/route";
import { GET as getMessageStatus } from "@/app/api/v1/messages/[messageId]/status/route";
import { POST as rotateWebhookSecret } from "@/app/api/v1/webhook-endpoints/[endpointId]/rotate-secret/route";
import { GET as listWebhookDeliveries } from "@/app/api/v1/webhook-endpoints/[endpointId]/deliveries/route";
import { POST as replayWebhookDelivery } from "@/app/api/v1/webhook-deliveries/[deliveryId]/replay/route";
import { POST as rotateCurrentApiKey } from "@/app/api/v1/api-keys/current/rotate/route";
import { DELETE as revokeCurrentApiKey } from "@/app/api/v1/api-keys/current/route";
import { prisma } from "@/lib/db/prisma";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { enqueueCustomerWebhookEvent } from "@/lib/integrations/customer-webhooks/outbox";
import { createCustomerWebhookEndpoint } from "@/lib/integrations/customer-webhooks/service";
import { verifyCustomerWebhookSignature } from "@/lib/integrations/customer-webhooks/signatures";
import {
  processClaimedCustomerWebhookDelivery
} from "@/lib/integrations/customer-webhooks/worker";
import { claimDueCustomerWebhookDeliveries } from "@/lib/db/customer-webhook-dispatch";
import { createApiCredential } from "@/lib/public-api/api-credential-service";

const run = process.env.RUN_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "");
const pepper = `exit-path-pepper-${suffix}`;
const masterKey = Buffer.alloc(32, 19).toString("base64");
const originalPepper = process.env.API_KEY_PEPPER;
const originalMasterKey = process.env.SECRETS_MASTER_KEY;

let orgAId: string;
let orgBId: string;
let tokenA: string;
let tokenB: string;
let endpointId: string;
let originalWebhookSecret: string;

const allScopes = [
  "organization:read",
  "contacts:read",
  "contacts:write",
  "messages:read",
  "messages:send",
  "deliveries:read",
  "credentials:read",
  "credentials:write",
  "webhooks:read",
  "webhooks:write",
  "webhooks:replay"
] as const;

describe.runIf(run)("M3 external application exit path", () => {
  beforeAll(async () => {
    process.env.API_KEY_PEPPER = pepper;
    process.env.SECRETS_MASTER_KEY = masterKey;
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: { name: "External app A", slug: `external-app-a-${suffix}`, demoMode: true }
      }),
      prisma.organization.create({
        data: { name: "External app B", slug: `external-app-b-${suffix}`, demoMode: true }
      })
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;
    const [credentialA, credentialB] = await Promise.all([
      createApiCredential({
        orgId: orgA.id,
        name: "External app A",
        scopes: allScopes,
        rateLimitPerMinute: 200,
        actor: { kind: "system" }
      }),
      createApiCredential({
        orgId: orgB.id,
        name: "External app B",
        scopes: ["contacts:read"],
        rateLimitPerMinute: 200,
        actor: { kind: "system" }
      })
    ]);
    tokenA = credentialA.token;
    tokenB = credentialB.token;

    const endpoint = await createCustomerWebhookEndpoint({
      orgId: orgA.id,
      name: "External receiver",
      url: "https://receiver.signalstack.dev/events",
      eventTypes: ["contact.created", "message.accepted"],
      actor: { kind: "system" }
    });
    endpointId = endpoint.endpoint.id;
    originalWebhookSecret = endpoint.signingSecret;
  });

  afterAll(async () => {
    if (orgAId || orgBId) {
      await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId].filter(Boolean) } } });
    }
    restoreEnvironment("API_KEY_PEPPER", originalPepper);
    restoreEnvironment("SECRETS_MASTER_KEY", originalMasterKey);
  });

  it("creates one idempotent contact and hides it from another tenant", async () => {
    const requestId = randomUUID();
    const body = {
      phone: "+15551234567",
      displayName: "Exit Path Contact",
      consentStatus: "OPTED_IN",
      consentCapturedAt: "2026-07-10T12:00:00.000Z",
      consentMethod: "WEB_FORM",
      consentDisclosure: "I agree to receive transactional text messages.",
      source: "external_app",
      tagNames: [],
      listNames: []
    };
    const first = await createContact(jsonRequest("/api/v1/contacts", tokenA, "POST", "contact-once", body, requestId));
    const replay = await createContact(jsonRequest("/api/v1/contacts", tokenA, "POST", "contact-once", body, randomUUID()));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(await first.clone().json()).toEqual(await replay.clone().json());
    expect(replay.headers.get("X-Request-Id")).toBe(requestId);

    const envelope = await first.json() as { data: { id: string } };
    const contactId = envelope.data.id;
    expect(await prisma.contact.count({ where: { orgId: orgAId, phone: body.phone } })).toBe(1);
    expect(await prisma.customerWebhookEvent.count({ where: { orgId: orgAId, type: "contact.created" } })).toBe(1);

    const foreignRead = await getContact(authRequest(`/api/v1/contacts/${contactId}`, tokenB), {
      params: Promise.resolve({ contactId })
    });
    expect(foreignRead.status).toBe(404);
  });

  it("accepts one dummy message, reads status, verifies signed events, and replays a forced failure after secret rotation", async () => {
    const contact = await prisma.contact.findFirstOrThrow({ where: { orgId: orgAId, phone: "+15551234567" } });
    const messageBody = { contactId: contact.id, body: "Your requested update is ready." };
    const [first, replay] = await Promise.all([
      createMessage(jsonRequest("/api/v1/messages", tokenA, "POST", "message-once", messageBody)),
      createMessage(jsonRequest("/api/v1/messages", tokenA, "POST", "message-once", messageBody))
    ]);
    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(await first.clone().json()).toEqual(await replay.clone().json());
    const envelope = await first.json() as { data: { message: { id: string; mode: string } } };
    expect(envelope.data.message.mode).toBe("dummy");
    expect(await prisma.message.count({ where: { orgId: orgAId, id: envelope.data.message.id } })).toBe(1);

    const status = await getMessageStatus(authRequest(`/api/v1/messages/${envelope.data.message.id}/status`, tokenA), {
      params: Promise.resolve({ messageId: envelope.data.message.id })
    });
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      data: { deliveryStatus: { messageId: envelope.data.message.id, status: "accepted_dummy", mode: "dummy" } }
    });

    const contactEvent = await prisma.customerWebhookEvent.findFirstOrThrow({
      where: { orgId: orgAId, type: "contact.created" }
    });
    const forcedFailure = await prisma.customerWebhookDelivery.findFirstOrThrow({
      where: { orgId: orgAId, eventId: contactEvent.id }
    });
    await prisma.customerWebhookDelivery.update({
      where: { id: forcedFailure.id },
      data: { maxAttempts: 1 }
    });

    const verifiedEventIds = new Set<string>();
    const claims = await claimDueCustomerWebhookDeliveries(20);
    for (const claim of claims.filter((candidate) => candidate.expectedOrgId === orgAId)) {
      await processClaimedCustomerWebhookDelivery(claim, {
        post: async ({ rawBody, headers }) => {
          const timestamp = header(headers, "X-SignalStack-Timestamp");
          const signature = header(headers, "X-SignalStack-Signature");
          expect(header(headers, "X-SignalStack-Secret-Version")).toBe("1");
          const eventId = header(headers, "X-SignalStack-Event-Id");
          expect(
            verifyCustomerWebhookSignature({
              secret: originalWebhookSecret,
              timestampHeader: timestamp,
              signatureHeader: signature,
              rawBody,
              nowSeconds: Number(timestamp)
            })
          ).toBe(true);
          verifiedEventIds.add(eventId);
          return {
            statusCode: eventId === contactEvent.id ? 500 : 204,
            retryAfter: null,
            body: Buffer.alloc(0)
          };
        }
      });
    }
    expect(verifiedEventIds).toContain(contactEvent.id);
    const failed = await prisma.customerWebhookDelivery.findUniqueOrThrow({ where: { id: forcedFailure.id } });
    expect(failed.status).toBe("FAILED");
    const deliveryList = await listWebhookDeliveries(
      authRequest(`/api/v1/webhook-endpoints/${endpointId}/deliveries`, tokenA),
      { params: Promise.resolve({ endpointId }) }
    );
    expect(deliveryList.status).toBe(200);
    await expect(deliveryList.json()).resolves.toMatchObject({
      data: {
        deliveries: expect.arrayContaining([
          expect.objectContaining({
            id: forcedFailure.id,
            status: "FAILED",
            attempts: [expect.objectContaining({ attemptNumber: 1, statusCode: 500, outcome: "failed" })]
          })
        ])
      }
    });

    const rotated = await rotateWebhookSecret(
      mutationRequest(`/api/v1/webhook-endpoints/${endpointId}/rotate-secret`, tokenA, "POST", "rotate-webhook"),
      { params: Promise.resolve({ endpointId }) }
    );
    expect(rotated.status).toBe(200);
    const rotatedEnvelope = await rotated.json() as { data: { signingSecret: string } };
    const rotatedSecret = rotatedEnvelope.data.signingSecret;
    expect(rotatedSecret).not.toBe(originalWebhookSecret);

    const replayResponse = await replayWebhookDelivery(
      mutationRequest(`/api/v1/webhook-deliveries/${failed.id}/replay`, tokenA, "POST", "replay-delivery"),
      { params: Promise.resolve({ deliveryId: failed.id }) }
    );
    expect(replayResponse.status).toBe(201);
    const replayEnvelope = await replayResponse.json() as { data: { delivery: { id: string } } };
    const replayDeliveryId = replayEnvelope.data.delivery.id;

    const replayClaims = await claimDueCustomerWebhookDeliveries(20);
    const replayClaim = replayClaims.find((claim) => claim.deliveryId === replayDeliveryId);
    expect(replayClaim).toBeDefined();
    await processClaimedCustomerWebhookDelivery(replayClaim!, {
      post: async ({ rawBody, headers }) => {
        const timestamp = header(headers, "X-SignalStack-Timestamp");
        const signature = header(headers, "X-SignalStack-Signature");
        expect(header(headers, "X-SignalStack-Secret-Version")).toBe("2");
        expect(verifyCustomerWebhookSignature({
          secret: rotatedSecret,
          timestampHeader: timestamp,
          signatureHeader: signature,
          rawBody,
          nowSeconds: Number(timestamp)
        })).toBe(true);
        expect(verifyCustomerWebhookSignature({
          secret: originalWebhookSecret,
          timestampHeader: timestamp,
          signatureHeader: signature,
          rawBody,
          nowSeconds: Number(timestamp)
        })).toBe(false);
        return { statusCode: 204, retryAfter: null, body: Buffer.alloc(0) };
      }
    });
    await expect(prisma.customerWebhookDelivery.findUniqueOrThrow({ where: { id: replayDeliveryId } }))
      .resolves.toMatchObject({ status: "DELIVERED", replayOfDeliveryId: failed.id });
  });

  it("rotates the API key in place, denies the old token, then revokes the replacement", async () => {
    const rotate = await rotateCurrentApiKey(
      mutationRequest("/api/v1/api-keys/current/rotate", tokenA, "POST", "rotate-api-key")
    );
    expect(rotate.status).toBe(200);
    const rotateEnvelope = await rotate.json() as { data: { token: string } };
    const replacement = rotateEnvelope.data.token;

    const oldDenied = await getOrganization(authRequest("/api/v1/organization", tokenA));
    expect(oldDenied.status).toBe(401);
    await expect(oldDenied.json()).resolves.toMatchObject({ error: { code: "INVALID_API_KEY" } });
    expect((await getOrganization(authRequest("/api/v1/organization", replacement))).status).toBe(200);

    const revoke = await revokeCurrentApiKey(
      mutationRequest("/api/v1/api-keys/current", replacement, "DELETE", "revoke-api-key")
    );
    expect(revoke.status).toBe(200);
    const revokedDenied = await getOrganization(authRequest("/api/v1/organization", replacement));
    expect(revokedDenied.status).toBe(401);
    await expect(revokedDenied.json()).resolves.toMatchObject({ error: { code: "INVALID_API_KEY" } });
  });

  it("retains ambiguous evidence after a post-before-finalize crash and retries with the next attempt", async () => {
    const outbox = await withTenantTransaction({ orgId: orgAId }, (tx) =>
      enqueueCustomerWebhookEvent(tx, {
        orgId: orgAId,
        deduplicationKey: `exit-path-crash:${suffix}`,
        type: "message.accepted",
        aggregateType: "message",
        aggregateId: `crash-${suffix}`,
        data: { messageId: `crash-${suffix}`, status: "accepted_dummy", mode: "dummy" }
      })
    );
    expect(outbox.deliveryCount).toBe(1);
    const delivery = await prisma.customerWebhookDelivery.findFirstOrThrow({
      where: { orgId: orgAId, eventId: outbox.event.id }
    });
    await prisma.customerWebhookDelivery.update({
      where: { id: delivery.id },
      data: { maxAttempts: 2 }
    });

    const firstClaim = (await claimDueCustomerWebhookDeliveries(20)).find(
      (candidate) => candidate.deliveryId === delivery.id
    );
    expect(firstClaim).toBeDefined();
    await expect(
      processClaimedCustomerWebhookDelivery(firstClaim!, {
        post: async () => ({ statusCode: 204, retryAfter: null, body: Buffer.alloc(0) }),
        finalize: async () => {
          throw new Error("kill injection after receiver impact");
        }
      })
    ).rejects.toThrow("kill injection");

    await expect(
      prisma.customerWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    ).resolves.toMatchObject({ status: "PROCESSING", attemptCount: 0 });
    await expect(
      prisma.customerWebhookDeliveryAttempt.findFirstOrThrow({
        where: { orgId: orgAId, deliveryId: delivery.id, attemptNumber: 1 }
      })
    ).resolves.toMatchObject({ outcome: null, finishedAt: null });
    const reader = await createApiCredential({
      orgId: orgAId,
      name: "Exit path processing reader",
      scopes: ["deliveries:read"],
      rateLimitPerMinute: 20,
      actor: { kind: "system" }
    });
    const processingList = await listWebhookDeliveries(
      authRequest(`/api/v1/webhook-endpoints/${endpointId}/deliveries`, reader.token),
      { params: Promise.resolve({ endpointId }) }
    );
    expect(processingList.status).toBe(200);
    await expect(processingList.json()).resolves.toMatchObject({
      data: {
        deliveries: expect.arrayContaining([
          expect.objectContaining({
            id: delivery.id,
            status: "PROCESSING",
            attempts: [expect.objectContaining({ outcome: "started", finishedAt: null })]
          })
        ])
      }
    });

    await prisma.customerWebhookDelivery.update({
      where: { id: delivery.id },
      data: { processingExpiresAt: new Date(Date.now() - 1_000) }
    });
    const recoveryClaim = (await claimDueCustomerWebhookDeliveries(20)).find(
      (candidate) => candidate.deliveryId === delivery.id
    );
    expect(recoveryClaim).toBeDefined();
    await expect(
      processClaimedCustomerWebhookDelivery(recoveryClaim!, {
        post: async () => ({ statusCode: 204, retryAfter: null, body: Buffer.alloc(0) })
      })
    ).resolves.toBe("delivered");

    const attempts = await prisma.customerWebhookDeliveryAttempt.findMany({
      where: { orgId: orgAId, deliveryId: delivery.id },
      orderBy: { attemptNumber: "asc" }
    });
    expect(attempts).toMatchObject([
      { attemptNumber: 1, outcome: "ambiguous", errorCode: "WORKER_LEASE_EXPIRED" },
      { attemptNumber: 2, outcome: "delivered", statusCode: 204 }
    ]);
    expect(attempts.every((attempt) => attempt.finishedAt instanceof Date)).toBe(true);
    await expect(
      prisma.customerWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    ).resolves.toMatchObject({ status: "DELIVERED", attemptCount: 2 });
  });
});

function authRequest(path: string, token: string, requestId = randomUUID()): Request {
  return new Request(`https://api.signalstack.test${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "X-Request-Id": requestId,
      "x-real-ip": "8.8.8.8"
    }
  });
}

function mutationRequest(path: string, token: string, method: "POST" | "DELETE", idempotencyKey: string): Request {
  return new Request(`https://api.signalstack.test${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
      "X-Request-Id": randomUUID(),
      "x-real-ip": "8.8.8.8"
    }
  });
}

function jsonRequest(
  path: string,
  token: string,
  method: "POST" | "PATCH",
  idempotencyKey: string,
  body: unknown,
  requestId = randomUUID()
): Request {
  return new Request(`https://api.signalstack.test${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Request-Id": requestId,
      "x-real-ip": "8.8.8.8"
    },
    body: JSON.stringify(body)
  });
}

function header(headers: Readonly<Record<string, string>> | undefined, name: string): string {
  const entry = Object.entries(headers ?? {}).find(([candidate]) => candidate.toLowerCase() === name.toLowerCase());
  if (!entry) throw new Error(`Missing receiver header ${name}.`);
  return entry[1];
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
