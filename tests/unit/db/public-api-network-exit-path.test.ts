import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  createServer,
  request as sendHttpRequest,
  type IncomingHttpHeaders,
  type Server
} from "node:http";
import { createRequire } from "node:module";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  claimDueCustomerWebhookDeliveries,
  type CustomerWebhookDeliveryClaim
} from "@/lib/db/customer-webhook-dispatch";
import { withTenantTransaction } from "@/lib/db/tenant-context";
import { createCustomerWebhookEndpoint } from "@/lib/integrations/customer-webhooks/service";
import { verifyCustomerWebhookSignature } from "@/lib/integrations/customer-webhooks/signatures";
import {
  finalizeClaimedCustomerWebhookDelivery,
  prepareClaimedCustomerWebhookDelivery,
  processClaimedCustomerWebhookDelivery,
  type CustomerWebhookFinalizationEvidence,
  type CustomerWebhookTenantTransactionRunner,
  type PreparedCustomerWebhookDelivery
} from "@/lib/integrations/customer-webhooks/worker";
import { createApiCredential } from "@/lib/public-api/api-credential-service";

const run =
  process.env.RUN_DB_TESTS === "true" &&
  process.env.RUN_NETWORK_DB_TESTS === "true";
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const databaseName = `signalstack_m3_network_${suffix}`;
const webRoleName = `signalstack_m3_web_${suffix}`;
const workerRoleName = `signalstack_m3_worker_${suffix}`;
const webRolePassword = `M3-Web-${suffix}-Password`;
const workerRolePassword = `M3-Worker-${suffix}-Password`;
const pepper = `m3-network-exit-pepper-${suffix}-dedicated-key-material`;
const masterKey = Buffer.alloc(32, 29).toString("base64");
const integrationEnvironment = Object.freeze({
  ...process.env,
  API_KEY_PEPPER: pepper,
  SECRETS_MASTER_KEY: masterKey
});
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

type JsonObject = Record<string, unknown>;
type NetworkSnapshot = Readonly<{
  status: number;
  body: JsonObject;
  requestId: string | null;
  idempotencyReplayed: string | null;
}>;
type ReceiverRecord = Readonly<{
  rawBody: Buffer;
  headers: IncomingHttpHeaders;
  deliveryId: string;
  eventId: string;
  secretVersion: number;
  verified: boolean;
  originalSecretAccepted: boolean | null;
}>;

let adminDatabase: PrismaClient | undefined;
let applicationDatabase: PrismaClient | undefined;
let workerDatabaseClient: PrismaClient | undefined;
let databaseCreated = false;
let webRoleCreated = false;
let workerRoleCreated = false;
let databaseUrl = "";
let orgId = "";
let orgBId = "";
let token = "";
let tokenB = "";
let endpointId = "";
let originalWebhookSecret = "";
let apiServer: ChildProcess | undefined;
let apiServerOutput = "";
let apiBaseUrl = "";
let receiverServer: Server | undefined;
let receiverBaseUrl = "";
const receiverSecrets = new Map<number, string>();
const receiverFailures = new Set<string>();
const receiverRecords: ReceiverRecord[] = [];

describe.runIf(run)("M3 literal external-network exit path", () => {
  beforeAll(async () => {
    const administrativeUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!administrativeUrl) {
      throw new Error("M3 network exit proof requires a PostgreSQL administrative URL.");
    }

    adminDatabase = new PrismaClient({ datasourceUrl: administrativeUrl });
    await adminDatabase.$connect();
    await adminDatabase.$executeRawUnsafe(`
      CREATE ROLE ${quoteIdentifier(webRoleName)}
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD ${quoteLiteral(webRolePassword)}
    `);
    webRoleCreated = true;
    await adminDatabase.$executeRawUnsafe(
      `GRANT signalstack_web TO ${quoteIdentifier(webRoleName)}`
    );
    await adminDatabase.$executeRawUnsafe(`
      CREATE ROLE ${quoteIdentifier(workerRoleName)}
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD ${quoteLiteral(workerRolePassword)}
    `);
    workerRoleCreated = true;
    await adminDatabase.$executeRawUnsafe(
      `GRANT signalstack_runtime, signalstack_worker TO ${quoteIdentifier(workerRoleName)}`
    );
    await adminDatabase.$executeRawUnsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
    databaseUrl = databaseUrlFor(administrativeUrl, databaseName);
    await deployMigrations(databaseUrl);
    applicationDatabase = new PrismaClient({ datasourceUrl: databaseUrl });
    await applicationDatabase.$connect();
    const webDatabaseUrl = databaseLoginUrl(
      administrativeUrl,
      databaseName,
      webRoleName,
      webRolePassword
    );
    const workerDatabaseUrl = databaseLoginUrl(
      administrativeUrl,
      databaseName,
      workerRoleName,
      workerRolePassword
    );
    workerDatabaseClient = new PrismaClient({ datasourceUrl: workerDatabaseUrl });
    await workerDatabaseClient.$connect();

    const [organization, organizationB] = await Promise.all([
      applicationDatabase.organization.create({
        data: {
          name: "M3 network exit organization A",
          slug: `m3-network-exit-a-${suffix}`,
          demoMode: true
        }
      }),
      applicationDatabase.organization.create({
        data: {
          name: "M3 network exit organization B",
          slug: `m3-network-exit-b-${suffix}`,
          demoMode: true
        }
      })
    ]);
    orgId = organization.id;
    orgBId = organizationB.id;
    const [credential, credentialB] = await Promise.all([
      tenantOperation(orgId, (tx) =>
        createApiCredential(
          {
            orgId,
            name: "M3 network exit client A",
            scopes: allScopes,
            rateLimitPerMinute: 500,
            actor: { kind: "system" }
          },
          tx,
          integrationEnvironment
        )
      ),
      tenantOperation(orgBId, (tx) =>
        createApiCredential(
          {
            orgId: orgBId,
            name: "M3 network exit client B",
            scopes: ["contacts:read", "contacts:write"],
            rateLimitPerMinute: 100,
            actor: { kind: "system" }
          },
          tx,
          integrationEnvironment
        )
      )
    ]);
    token = credential.token;
    tokenB = credentialB.token;

    const endpoint = await tenantOperation(orgId, (tx) =>
      createCustomerWebhookEndpoint(
        {
          orgId,
          name: "M3 socket receiver",
          url: "https://receiver.signalstack.dev/events",
          eventTypes: ["contact.created", "message.accepted"],
          actor: { kind: "system" }
        },
        tx,
        integrationEnvironment
      )
    );
    endpointId = endpoint.endpoint.id;
    originalWebhookSecret = endpoint.signingSecret;
    receiverSecrets.set(1, originalWebhookSecret);

    receiverServer = await startReceiverServer();
    receiverBaseUrl = serverBaseUrl(receiverServer);
    apiServer = await startNextServer(webDatabaseUrl);
    apiBaseUrl = apiServerBaseUrl(apiServer);
    await waitForNextServer();
  }, 180_000);

  afterAll(async () => {
    await stopChildProcess(apiServer);
    await closeHttpServer(receiverServer);
    await workerDatabaseClient?.$disconnect();
    await applicationDatabase?.$disconnect();
    if (databaseCreated && adminDatabase) {
      await adminDatabase.$executeRawUnsafe(
        `DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`
      );
    }
    if (workerRoleCreated && adminDatabase) {
      await adminDatabase.$executeRawUnsafe(
        `REVOKE signalstack_runtime, signalstack_worker FROM ${quoteIdentifier(workerRoleName)}`
      );
      await adminDatabase.$executeRawUnsafe(`DROP ROLE ${quoteIdentifier(workerRoleName)}`);
    }
    if (webRoleCreated && adminDatabase) {
      await adminDatabase.$executeRawUnsafe(
        `REVOKE signalstack_web FROM ${quoteIdentifier(webRoleName)}`
      );
      await adminDatabase.$executeRawUnsafe(`DROP ROLE ${quoteIdentifier(webRoleName)}`);
    }
    await adminDatabase?.$disconnect();
  }, 60_000);

  it("crosses real API and receiver sockets for the complete local-only integration lifecycle", async () => {
    const unauthenticatedRoot = await readNetworkSnapshot(
      await fetch(`${apiBaseUrl}/api/v1`, {
        headers: { "X-Request-Id": randomUUID() },
        signal: AbortSignal.timeout(30_000)
      })
    );
    expect(unauthenticatedRoot).toMatchObject({
      status: 401,
      body: { error: { code: "AUTHENTICATION_REQUIRED" } }
    });
    const authenticatedRoot = await readNetworkSnapshot(
      await apiRequest("/api/v1", token)
    );
    expect(authenticatedRoot).toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } }
    });
    const unknownPath = await readNetworkSnapshot(
      await apiRequest("/api/v1/not-a-real/resource", token)
    );
    expect(unknownPath).toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } }
    });

    const unauthenticatedHead = await fetch(`${apiBaseUrl}/api/v1/organization`, {
      method: "HEAD",
      headers: { "X-Request-Id": randomUUID() },
      signal: AbortSignal.timeout(30_000)
    });
    expect(unauthenticatedHead.status).toBe(401);
    expect(await unauthenticatedHead.text()).toBe("");
    const authenticatedHead = await apiRequest("/api/v1/organization", token, {
      method: "HEAD"
    });
    expect(authenticatedHead.status).toBe(405);
    expect(authenticatedHead.headers.get("Allow")).toBe("GET");
    expect(authenticatedHead.headers.get("RateLimit-Limit")).toBe("500");
    expect(await authenticatedHead.text()).toBe("");

    const unauthenticatedOptions = await readNetworkSnapshot(
      await fetch(`${apiBaseUrl}/api/v1/organization`, {
        method: "OPTIONS",
        headers: { "X-Request-Id": randomUUID() },
        signal: AbortSignal.timeout(30_000)
      })
    );
    expect(unauthenticatedOptions).toMatchObject({
      status: 401,
      body: { error: { code: "AUTHENTICATION_REQUIRED" } }
    });
    const authenticatedOptionsResponse = await apiRequest(
      "/api/v1/organization",
      token,
      { method: "OPTIONS" }
    );
    expect(authenticatedOptionsResponse.headers.get("Allow")).toBe("GET");
    const authenticatedOptions = await readNetworkSnapshot(authenticatedOptionsResponse);
    expect(authenticatedOptions).toMatchObject({
      status: 405,
      body: { error: { code: "METHOD_NOT_ALLOWED" } }
    });

    const contactBody = {
      phone: "+15551234567",
      displayName: "Network Exit Contact",
      consentStatus: "OPTED_IN",
      consentCapturedAt: "2026-07-10T12:00:00.000Z",
      consentMethod: "WEB_FORM",
      consentDisclosure: "I agree to receive transactional text messages.",
      source: "external_app",
      tagNames: [],
      listNames: []
    };
    const contactResponses = await Promise.all(
      Array.from({ length: 6 }, () =>
        apiRequest("/api/v1/contacts", token, {
          method: "POST",
          idempotencyKey: `network-contact-${suffix}`,
          body: contactBody
        })
      )
    );
    const contactSnapshots = await Promise.all(contactResponses.map(readNetworkSnapshot));
    assertExactConcurrentReplay(contactSnapshots, 201);
    const contact = dataObject(contactSnapshots[0]!.body);
    const contactId = stringField(contact, "id");
    expect(
      await database().contact.count({ where: { orgId, phone: contactBody.phone } })
    ).toBe(1);
    expect(
      await database().customerWebhookEvent.count({
        where: { orgId, type: "contact.created" }
      })
    ).toBe(1);

    const foreignRead = await readNetworkSnapshot(
      await apiRequest(`/api/v1/contacts/${contactId}`, tokenB)
    );
    expect(foreignRead).toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } }
    });
    const foreignMutation = await readNetworkSnapshot(
      await apiRequest(`/api/v1/contacts/${contactId}`, tokenB, {
        method: "PATCH",
        idempotencyKey: `network-cross-tenant-${suffix}`,
        body: { displayName: "Cross-tenant mutation must not land" }
      })
    );
    expect(foreignMutation).toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } }
    });
    await expect(
      database().contact.findUniqueOrThrow({ where: { id: contactId } })
    ).resolves.toMatchObject({ displayName: contactBody.displayName });

    const messageBody = {
      contactId,
      body: "Your requested local-only update is ready."
    };
    const messageResponses = await Promise.all(
      Array.from({ length: 6 }, () =>
        apiRequest("/api/v1/messages", token, {
          method: "POST",
          idempotencyKey: `network-message-${suffix}`,
          body: messageBody
        })
      )
    );
    const messageSnapshots = await Promise.all(messageResponses.map(readNetworkSnapshot));
    assertExactConcurrentReplay(messageSnapshots, 202);
    const messageEnvelope = dataObject(messageSnapshots[0]!.body);
    const message = objectField(messageEnvelope, "message");
    const messageId = stringField(message, "id");
    expect(message).toMatchObject({ mode: "dummy", status: "accepted_dummy" });
    expect(await database().message.count({ where: { orgId, id: messageId } })).toBe(1);
    expect(
      await database().customerWebhookEvent.count({
        where: { orgId, type: "message.accepted", aggregateId: messageId }
      })
    ).toBe(1);

    const status = await readNetworkSnapshot(
      await apiRequest(`/api/v1/messages/${messageId}/status`, token)
    );
    expect(status.status).toBe(200);
    expect(dataObject(status.body)).toMatchObject({
      deliveryStatus: {
        messageId,
        status: "accepted_dummy",
        mode: "dummy"
      }
    });

    const contactEvent = await database().customerWebhookEvent.findFirstOrThrow({
      where: { orgId, type: "contact.created" }
    });
    const messageEvent = await database().customerWebhookEvent.findFirstOrThrow({
      where: { orgId, type: "message.accepted" }
    });
    const contactDelivery = await database().customerWebhookDelivery.findFirstOrThrow({
      where: { orgId, eventId: contactEvent.id }
    });
    const messageDelivery = await database().customerWebhookDelivery.findFirstOrThrow({
      where: { orgId, eventId: messageEvent.id }
    });
    await database().customerWebhookDelivery.updateMany({
      where: { id: { in: [contactDelivery.id, messageDelivery.id] } },
      data: { nextAttemptAt: new Date(0) }
    });
    await database().customerWebhookDelivery.update({
      where: { id: contactDelivery.id },
      data: { maxAttempts: 1 }
    });
    receiverFailures.add(contactDelivery.id);

    const initialClaims = await claimFromDisposableDatabase(2);
    expect(new Set(initialClaims.map((claim) => claim.deliveryId))).toEqual(
      new Set([contactDelivery.id, messageDelivery.id])
    );
    for (const claim of initialClaims) {
      await processThroughReceiverSocket(claim);
    }

    const initialReceiverRecords = receiverRecords.filter((record) =>
      [contactDelivery.id, messageDelivery.id].includes(record.deliveryId)
    );
    expect(initialReceiverRecords).toHaveLength(2);
    for (const record of initialReceiverRecords) {
      const event = record.eventId === contactEvent.id ? contactEvent : messageEvent;
      expect(record.rawBody.toString("utf8")).toBe(event.payloadText);
      expect(record.secretVersion).toBe(1);
      expect(record.verified).toBe(true);
      expect(record.headers["x-signalstack-event-type"]).toBe(event.type);
      expect(record.headers["user-agent"]).toBe("SignalStack-Customer-Webhooks/1");
    }
    await expect(
      database().customerWebhookDelivery.findUniqueOrThrow({ where: { id: contactDelivery.id } })
    ).resolves.toMatchObject({ status: "FAILED", attemptCount: 1, lastStatusCode: 500 });
    await expect(
      database().customerWebhookDelivery.findUniqueOrThrow({ where: { id: messageDelivery.id } })
    ).resolves.toMatchObject({ status: "DELIVERED", attemptCount: 1, lastStatusCode: 204 });

    const deliveryList = await readNetworkSnapshot(
      await apiRequest(`/api/v1/webhook-endpoints/${endpointId}/deliveries`, token)
    );
    expect(deliveryList.status).toBe(200);
    const listedDeliveries = arrayField(dataObject(deliveryList.body), "deliveries");
    expect(listedDeliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: contactDelivery.id,
          status: "FAILED",
          attempts: [
            expect.objectContaining({ attemptNumber: 1, statusCode: 500, outcome: "failed" })
          ]
        })
      ])
    );

    const rotatedWebhook = await readNetworkSnapshot(
      await apiRequest(`/api/v1/webhook-endpoints/${endpointId}/rotate-secret`, token, {
        method: "POST",
        idempotencyKey: `network-rotate-webhook-${suffix}`
      })
    );
    expect(rotatedWebhook.status, JSON.stringify(rotatedWebhook.body)).toBe(200);
    const rotatedWebhookSecret = stringField(dataObject(rotatedWebhook.body), "signingSecret");
    expect(rotatedWebhookSecret).not.toBe(originalWebhookSecret);
    receiverSecrets.set(2, rotatedWebhookSecret);

    const replayResponse = await readNetworkSnapshot(
      await apiRequest(`/api/v1/webhook-deliveries/${contactDelivery.id}/replay`, token, {
        method: "POST",
        idempotencyKey: `network-replay-webhook-${suffix}`
      })
    );
    expect(replayResponse.status).toBe(201);
    const replayDelivery = objectField(dataObject(replayResponse.body), "delivery");
    const replayDeliveryId = stringField(replayDelivery, "id");
    await database().customerWebhookDelivery.update({
      where: { id: replayDeliveryId },
      data: { nextAttemptAt: new Date(0) }
    });
    const replayClaims = await claimFromDisposableDatabase(1);
    expect(replayClaims).toHaveLength(1);
    expect(replayClaims[0]?.deliveryId).toBe(replayDeliveryId);
    await processThroughReceiverSocket(replayClaims[0]!);

    const replayRecord = receiverRecords.find((record) => record.deliveryId === replayDeliveryId);
    expect(replayRecord).toMatchObject({
      eventId: contactEvent.id,
      secretVersion: 2,
      verified: true,
      originalSecretAccepted: false
    });
    expect(replayRecord?.rawBody.toString("utf8")).toBe(contactEvent.payloadText);
    await expect(
      database().customerWebhookDelivery.findUniqueOrThrow({
        where: { id: replayDeliveryId },
        include: { signingSecret: true }
      })
    ).resolves.toMatchObject({
      status: "DELIVERED",
      replayOfDeliveryId: contactDelivery.id,
      signingSecret: { version: 2 }
    });

    const rotatedApiKey = await readNetworkSnapshot(
      await apiRequest("/api/v1/api-keys/current/rotate", token, {
        method: "POST",
        idempotencyKey: `network-rotate-api-key-${suffix}`
      })
    );
    expect(rotatedApiKey.status).toBe(200);
    const replacementToken = stringField(dataObject(rotatedApiKey.body), "token");
    const oldTokenDenied = await readNetworkSnapshot(
      await apiRequest("/api/v1/organization", token)
    );
    expect(oldTokenDenied).toMatchObject({
      status: 401,
      body: { error: { code: "INVALID_API_KEY" } }
    });
    expect(
      (await apiRequest("/api/v1/organization", replacementToken)).status
    ).toBe(200);

    const revoked = await readNetworkSnapshot(
      await apiRequest("/api/v1/api-keys/current", replacementToken, {
        method: "DELETE",
        idempotencyKey: `network-revoke-api-key-${suffix}`
      })
    );
    expect(revoked.status).toBe(200);
    const revokedTokenDenied = await readNetworkSnapshot(
      await apiRequest("/api/v1/organization", replacementToken)
    );
    expect(revokedTokenDenied).toMatchObject({
      status: 401,
      body: { error: { code: "INVALID_API_KEY" } }
    });
  }, 120_000);
});

async function tenantOperation<T>(
  operationOrgId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return withTenantTransaction({ orgId: operationOrgId }, operation, {
    client: database(),
    attest: false
  });
}

const disposableTenantTransaction: CustomerWebhookTenantTransactionRunner = (
  context,
  operation
) =>
  withTenantTransaction({ orgId: context.orgId }, operation, {
    client: workerDatabase(),
    attest: true
  });

async function claimFromDisposableDatabase(
  limit: number
): Promise<readonly CustomerWebhookDeliveryClaim[]> {
  return claimDueCustomerWebhookDeliveries(limit, {
    claimRows: ({ maxDeliveries, leaseMs, processingToken }) =>
      workerDatabase().$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE signalstack_worker");
        return tx.$queryRaw<Array<{ deliveryId: string; orgId: string }>>`
          SELECT claimed."deliveryId", claimed."orgId"
          FROM public.claim_due_customer_webhook_deliveries(
            ${maxDeliveries}::integer,
            ${leaseMs}::integer,
            ${processingToken}::uuid
          ) AS claimed
        `;
      })
  });
}

async function processThroughReceiverSocket(
  claim: CustomerWebhookDeliveryClaim
): Promise<void> {
  const outcome = await processClaimedCustomerWebhookDelivery(claim, {
    environment: integrationEnvironment,
    post: bridgeWebhookPostToReceiver,
    prepare: (candidate) =>
      prepareClaimedCustomerWebhookDelivery(candidate, {
        transaction: disposableTenantTransaction
      }),
    finalize: (
      candidate: CustomerWebhookDeliveryClaim,
      prepared: PreparedCustomerWebhookDelivery,
      decision,
      evidence: CustomerWebhookFinalizationEvidence
    ) =>
      finalizeClaimedCustomerWebhookDelivery(candidate, prepared, decision, evidence, {
        transaction: disposableTenantTransaction
      })
  });
  expect(["delivered", "failed"]).toContain(outcome);
}

async function bridgeWebhookPostToReceiver(input: Readonly<{
  endpointUrl: string;
  rawBody: Buffer | Uint8Array;
  headers?: Readonly<Record<string, string>>;
}>): Promise<Readonly<{ statusCode: number; retryAfter: string | null; body: Buffer }>> {
  expect(input.endpointUrl).toBe("https://receiver.signalstack.dev/events");
  const rawBody = Buffer.from(input.rawBody);
  return new Promise((resolve, reject) => {
    const request = sendHttpRequest(`${receiverBaseUrl}/events`, {
      method: "POST",
      headers: {
        ...input.headers,
        "Content-Type": "application/json",
        "Content-Length": rawBody.byteLength.toString()
      }
    });
    request.once("error", reject);
    request.once("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      response.once("end", () =>
        resolve({
          statusCode: response.statusCode ?? 500,
          retryAfter: stringHeader(response.headers, "retry-after", false),
          body: Buffer.concat(chunks)
        })
      );
      response.once("error", reject);
    });
    request.end(rawBody);
  });
}

async function startReceiverServer(): Promise<Server> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > 1_048_576) {
        request.destroy(new Error("Receiver request exceeded the test limit."));
        return;
      }
      chunks.push(bytes);
    });
    request.once("error", () => {
      if (!response.headersSent) response.writeHead(400);
      response.end();
    });
    request.once("end", () => {
      try {
        if (request.method !== "POST" || request.url !== "/events") {
          response.writeHead(404).end();
          return;
        }
        const rawBody = Buffer.concat(chunks, total);
        const deliveryId = stringHeader(request.headers, "x-signalstack-delivery-id");
        const eventId = stringHeader(request.headers, "x-signalstack-event-id");
        const timestamp = stringHeader(request.headers, "x-signalstack-timestamp");
        const signature = stringHeader(request.headers, "x-signalstack-signature");
        const secretVersion = Number(
          stringHeader(request.headers, "x-signalstack-secret-version")
        );
        const activeSecret = receiverSecrets.get(secretVersion);
        const verified = Boolean(
          activeSecret &&
            verifyCustomerWebhookSignature({
              secret: activeSecret,
              timestampHeader: timestamp,
              signatureHeader: signature,
              rawBody,
              nowSeconds: Number(timestamp)
            })
        );
        const originalSecretAccepted =
          secretVersion === 1
            ? null
            : verifyCustomerWebhookSignature({
                secret: originalWebhookSecret,
                timestampHeader: timestamp,
                signatureHeader: signature,
                rawBody,
                nowSeconds: Number(timestamp)
              });
        receiverRecords.push(
          Object.freeze({
            rawBody,
            headers: request.headers,
            deliveryId,
            eventId,
            secretVersion,
            verified,
            originalSecretAccepted
          })
        );
        const status = verified
          ? receiverFailures.delete(deliveryId)
            ? 500
            : 204
          : 400;
        response.writeHead(status).end();
      } catch {
        if (!response.headersSent) response.writeHead(400);
        response.end();
      }
    });
  });
  await listenOnLoopback(server);
  return server;
}

async function startNextServer(disposableDatabaseUrl: string): Promise<ChildProcess> {
  const port = await reserveLoopbackPort();
  const require = createRequire(import.meta.url);
  const nextCli = require.resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", port.toString()],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        APP_ENV: "test",
        DEMO_MODE: "true",
        LIVE_MESSAGING_ENABLED: "false",
        MESSAGING_PROVIDER: "dummy",
        AI_PROVIDER: "fake",
        DATABASE_URL: disposableDatabaseUrl,
        MIGRATION_DATABASE_URL: "",
        DATABASE_RLS_ENFORCED: "true",
        API_KEY_PEPPER: pepper,
        SECRETS_MASTER_KEY: masterKey,
        NEXT_TELEMETRY_DISABLED: "1",
        WEB_HOST: "127.0.0.1",
        WEB_PORT: port.toString(),
        NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`
      }
    }
  );
  const collectOutput = (chunk: Buffer | string) => {
    apiServerOutput = `${apiServerOutput}${String(chunk)}`.slice(-32_768);
  };
  child.stdout?.on("data", collectOutput);
  child.stderr?.on("data", collectOutput);
  child.once("error", (error) => collectOutput(`Next process error: ${error.message}`));
  Object.defineProperty(child, "__signalstackPort", { value: port });
  return child;
}

function apiServerBaseUrl(child: ChildProcess): string {
  const port = (child as ChildProcess & { __signalstackPort?: number }).__signalstackPort;
  if (!port) throw new Error("Next server port was not recorded.");
  return `http://127.0.0.1:${port}`;
}

async function waitForNextServer(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (
      !apiServer?.pid ||
      apiServer.exitCode !== null ||
      apiServer.signalCode !== null
    ) {
      throw new Error(`Next server exited before readiness.\n${apiServerOutput}`);
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/openapi.json`, {
        signal: AbortSignal.timeout(2_000)
      });
      if (response.status === 200) return;
    } catch {
      // Startup and first compilation are expected to refuse connections briefly.
    }
    await delay(250);
  }
  throw new Error(`Next server did not become ready.\n${apiServerOutput}`);
}

async function apiRequest(
  path: string,
  apiToken: string,
  options: Readonly<{
    method?: "GET" | "POST" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    idempotencyKey?: string;
    body?: unknown;
  }> = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "X-Request-Id": randomUUID(),
    "X-Real-Ip": "198.51.100.42"
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000)
  });
}

async function readNetworkSnapshot(response: Response): Promise<NetworkSnapshot> {
  const rawBody = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error(
      `Network API returned non-JSON: ${response.status} ${response.url} ` +
      `content-type=${response.headers.get("content-type") ?? "missing"} ` +
      `body=${JSON.stringify(rawBody.slice(0, 500))}\nNext output:\n${apiServerOutput}`
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Network API returned a non-object JSON envelope: ${response.status} ${response.url}`);
  }
  const body = parsed as JsonObject;
  return Object.freeze({
    status: response.status,
    body,
    requestId: response.headers.get("X-Request-Id"),
    idempotencyReplayed: response.headers.get("Idempotency-Replayed")
  });
}

function assertExactConcurrentReplay(
  snapshots: readonly NetworkSnapshot[],
  expectedStatus: number
): void {
  expect(snapshots).toHaveLength(6);
  expect(snapshots.every((snapshot) => snapshot.status === expectedStatus)).toBe(true);
  expect(new Set(snapshots.map((snapshot) => JSON.stringify(snapshot.body))).size).toBe(1);
  expect(new Set(snapshots.map((snapshot) => snapshot.requestId)).size).toBe(1);
  expect(snapshots.filter((snapshot) => snapshot.idempotencyReplayed === "true")).toHaveLength(5);
  expect(snapshots.filter((snapshot) => snapshot.idempotencyReplayed === "false")).toHaveLength(1);
  const responseRequestId = stringField(snapshots[0]!.body.meta as JsonObject, "requestId");
  expect(snapshots[0]?.requestId).toBe(responseRequestId);
}

function dataObject(envelope: JsonObject): JsonObject {
  return objectField(envelope, "data");
}

function objectField(value: JsonObject, name: string): JsonObject {
  const candidate = value[name];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`Expected object field ${name}.`);
  }
  return candidate as JsonObject;
}

function arrayField(value: JsonObject, name: string): unknown[] {
  const candidate = value[name];
  if (!Array.isArray(candidate)) {
    throw new Error(`Expected array field ${name}.`);
  }
  return candidate;
}

function stringField(value: JsonObject, name: string): string {
  const candidate = value[name];
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`Expected string field ${name}.`);
  }
  return candidate;
}

function database(): PrismaClient {
  if (!applicationDatabase) throw new Error("Disposable application database is unavailable.");
  return applicationDatabase;
}

function workerDatabase(): PrismaClient {
  if (!workerDatabaseClient) throw new Error("Disposable worker database is unavailable.");
  return workerDatabaseClient;
}

async function deployMigrations(targetDatabaseUrl: string): Promise<void> {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !existsSync(npmCli)) {
    throw new Error("npm_execpath is required for M3 network migration proof.");
  }
  const result = spawnSync(
    process.execPath,
    [npmCli, "exec", "--", "prisma", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: targetDatabaseUrl,
        MIGRATION_DATABASE_URL: targetDatabaseUrl
      },
      timeout: 120_000
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`M3 network migration deployment failed.\n${result.stdout}\n${result.stderr}`);
  }
}

function databaseUrlFor(source: string, targetDatabase: string): string {
  const url = new URL(source);
  url.pathname = `/${targetDatabase}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}

function databaseLoginUrl(
  source: string,
  targetDatabase: string,
  role: string,
  password: string
): string {
  const url = new URL(databaseUrlFor(source, targetDatabase));
  url.username = role;
  url.password = password;
  return url.toString();
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("Unsafe disposable database identifier.");
  }
  return `"${value}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await listenOnLoopback(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(server);
    throw new Error("Unable to reserve a loopback port.");
  }
  const port = address.port;
  await closeHttpServer(server);
  return port;
}

function listenOnLoopback(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function serverBaseUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server is not listening.");
  return `http://127.0.0.1:${address.port}`;
}

async function closeHttpServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function stopChildProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 5_000)) return;

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", child.pid.toString(), "/T", "/F"], {
      stdio: "ignore",
      timeout: 10_000
    });
  } else {
    child.kill("SIGKILL");
  }
  await waitForChildExit(child, 10_000);
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

function stringHeader(headers: IncomingHttpHeaders, name: string): string;
function stringHeader(
  headers: IncomingHttpHeaders,
  name: string,
  required: false
): string | null;
function stringHeader(
  headers: IncomingHttpHeaders,
  name: string,
  required = true
): string | null {
  const value = headers[name.toLowerCase()];
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized === "string" && normalized.length > 0) return normalized;
  if (!required) return null;
  throw new Error(`Missing receiver header ${name}.`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
