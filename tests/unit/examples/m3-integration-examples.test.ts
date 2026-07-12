import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { validateTwilioSignature } from "@/lib/messaging/twilio-webhooks";
import {
  CustomerWebhookVerificationError,
  InMemoryEventDeduplicator,
  headersRecordToRawHeaders,
  verifyCustomerWebhookRequest
} from "@/examples/customer-webhook/verify";
import { generateCustomerWebhookGoldenVector } from "@/examples/customer-webhook/generate-golden-vector";
import { createTwilioCallbackExample } from "@/examples/provider-callback/twilio-callback";
import { SignalStackClient } from "@/examples/public-api/typescript-client";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const apiKey = `ss_api_${"A".repeat(12)}_${"B".repeat(43)}`;
const rotatedApiKey = `ss_api_${"C".repeat(12)}_${"D".repeat(43)}`;

describe("M3 public API client example", () => {
  it("sends bearer/idempotency evidence and iterates opaque cursors", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const responses = [
      successResponse({ contacts: [{ id: "contact_1" }] }, { hasMore: true, nextCursor: "opaque.cursor" }),
      successResponse({ contacts: [{ id: "contact_2" }] }, { hasMore: false, nextCursor: null })
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return responses.shift()!;
    });
    const client = new SignalStackClient({ baseUrl: "http://127.0.0.1:3000", apiKey, fetch: fetchMock });
    const contacts = [];
    for await (const contact of client.iterateCollection<{ id: string }>("/api/v1/contacts", "contacts", 1)) {
      contacts.push(contact.id);
    }

    expect(contacts).toEqual(["contact_1", "contact_2"]);
    expect(requests[0].url).toBe("http://127.0.0.1:3000/api/v1/contacts?limit=1");
    expect(requests[1].url).toContain("cursor=opaque.cursor");
    expect(new Headers(requests[0].init?.headers).get("authorization")).toBe(`Bearer ${apiKey}`);
    expect(requests[0].url).not.toContain(apiKey);
  });

  it("surfaces stable errors and replaces the in-memory key after one-time rotation", async () => {
    const authorizations: string[] = [];
    const requestInits: Array<RequestInit | undefined> = [];
    const responses = [
      successResponse({ token: rotatedApiKey, credential: { id: "cred_1", prefix: "CCCCCCCCCCCC" } }),
      errorResponse(401, "INVALID_API_KEY"),
      successResponse({ credential: { id: "cred_1" } })
    ];
    const client = new SignalStackClient({
      baseUrl: "https://signalstack.example",
      apiKey,
      fetch: vi.fn(async (_input, init) => {
        authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
        requestInits.push(init);
        return responses.shift()!;
      })
    });

    await client.rotateCurrentKey("rotate-example-01");
    await expect(client.request("/api/v1/api-keys/current")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_API_KEY",
      requestId
    });
    await client.request("/api/v1/api-keys/current");
    expect(authorizations).toEqual([
      `Bearer ${apiKey}`,
      `Bearer ${rotatedApiKey}`,
      `Bearer ${rotatedApiKey}`
    ]);
    expect(requestInits[0]?.body).toBeUndefined();
    expect(new Headers(requestInits[0]?.headers).get("content-type")).toBeNull();
    expect(new Headers(requestInits[0]?.headers).get("idempotency-key")).toBe("rotate-example-01");
  });

  it("attaches the caller's Idempotency-Key to JSON mutations", async () => {
    let capturedHeaders = new Headers();
    const client = new SignalStackClient({
      baseUrl: "http://localhost:3000",
      apiKey,
      fetch: vi.fn(async (_input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return successResponse({ id: "contact_1" });
      })
    });
    await client.createContact({ phone: "+15555550100" }, "contact-example-01");
    expect(capturedHeaders.get("idempotency-key")).toBe("contact-example-01");
    expect(capturedHeaders.get("content-type")).toBe("application/json");
  });
});

describe("M3 customer-webhook receiver examples", () => {
  const fixture = generateCustomerWebhookGoldenVector();
  const rawBody = Buffer.from(fixture.rawBodyBase64, "base64");
  const headers = headersRecordToRawHeaders(fixture.headers);
  const secrets = new Map([[fixture.secretVersion, fixture.secret]]);

  it("keeps the checked-in vector identical to the production-signer generator", () => {
    const checkedIn = JSON.parse(
      readFileSync(join(process.cwd(), "examples", "customer-webhook", "golden-vector.json"), "utf8")
    );
    expect(checkedIn).toEqual(fixture);
  });

  it("verifies exact raw bytes, timestamp, event identity, and pinned secret version", () => {
    expect(
      verifyCustomerWebhookRequest({
        rawHeaders: headers,
        rawBody,
        secretsByVersion: secrets,
        nowSeconds: fixture.nowSeconds
      })
    ).toMatchObject({
      eventId: fixture.eventId,
      eventType: fixture.eventType,
      deliveryId: fixture.deliveryId,
      secretVersion: fixture.secretVersion
    });
  });

  it("rejects duplicate security headers, changed bytes, stale clocks, and unknown versions", () => {
    const base = { rawHeaders: headers, rawBody, secretsByVersion: secrets, nowSeconds: fixture.nowSeconds };
    expect(() =>
      verifyCustomerWebhookRequest({
        ...base,
        rawHeaders: [...headers, "X-SignalStack-Timestamp", fixture.timestamp]
      })
    ).toThrow(CustomerWebhookVerificationError);
    expect(() => verifyCustomerWebhookRequest({ ...base, rawBody: Buffer.from(rawBody.toString().trim()) })).toThrow(
      CustomerWebhookVerificationError
    );
    expect(() => verifyCustomerWebhookRequest({ ...base, nowSeconds: fixture.nowSeconds + 301 })).toThrow(
      CustomerWebhookVerificationError
    );
    expect(() => verifyCustomerWebhookRequest({ ...base, secretsByVersion: new Map() })).toThrow(
      CustomerWebhookVerificationError
    );
  });

  it("demonstrates claim-once event-ID deduplication", () => {
    const deduplicator = new InMemoryEventDeduplicator();
    expect(deduplicator.claim(fixture.eventId)).toBe(true);
    expect(deduplicator.claim(fixture.eventId)).toBe(false);
  });
});

describe("M3 provider callback example", () => {
  it("matches the implemented URL-plus-sorted-form Twilio signature boundary", () => {
    const example = createTwilioCallbackExample({
      kind: "status",
      baseUrl: "http://127.0.0.1:3000",
      authToken: "local-example-token"
    });
    expect(
      validateTwilioSignature({
        authToken: "local-example-token",
        signature: example.signature,
        url: example.url,
        params: { ...example.params }
      })
    ).toBe(true);
    expect(() =>
      createTwilioCallbackExample({
        kind: "inbound",
        baseUrl: "https://provider.example",
        authToken: "local-example-token"
      })
    ).toThrow("localhost");
  });
});

function successResponse(data: unknown, meta: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: true, data, meta: { ...meta, requestId } }), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId }
  });
}

function errorResponse(status: number, code: string) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: { code, message: "The API key is invalid." },
      meta: { requestId }
    }),
    { status, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }
  );
}
