import { describe, expect, it } from "vitest";

import {
  DELETE as deleteOpenApiRoute,
  GET as getOpenApiRoute
} from "@/app/api/v1/openapi.json/route";
import {
  createPublicApiOpenApiDocument,
  serializePublicApiOpenApiDocument
} from "@/lib/public-api/openapi";
import { PUBLIC_API_OPERATIONS } from "@/lib/public-api/openapi-registry";
import { API_SCOPES } from "@/lib/public-api/scopes";
import { canonicalizeCustomerWebhookEndpointUrl } from "@/lib/integrations/customer-webhooks/endpoint-security";
import {
  assertOpenApiBasics,
  assertRouteCoverage,
  checkPublicApiOpenApi,
  discoverPublicApiRouteOperations
} from "@/scripts/openapi-check";

type JsonObject = Record<string, unknown>;

describe("public API OpenAPI document", () => {
  it("generates deterministic OpenAPI 3.1 JSON with every registered operation", () => {
    const first = serializePublicApiOpenApiDocument();
    const second = serializePublicApiOpenApiDocument();
    const document = createPublicApiOpenApiDocument();

    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual(document);
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toHaveLength(
      new Set(PUBLIC_API_OPERATIONS.map((operation) => operation.path)).size
    );
    expect(() => assertOpenApiBasics(document)).not.toThrow();
  });

  it("keeps route handlers and the typed registry in exact bidirectional coverage", () => {
    const implemented = discoverPublicApiRouteOperations();

    expect(implemented).toHaveLength(PUBLIC_API_OPERATIONS.length);
    expect(() => assertRouteCoverage()).not.toThrow();
    expect(() => checkPublicApiOpenApi()).not.toThrow();
  });

  it("declares the only public exception, exact scopes, idempotency, and cursor controls", () => {
    const document = createPublicApiOpenApiDocument();
    const openApiGet = operationAt(document.paths, "/api/v1/openapi.json", "get");
    const contactCreate = operationAt(document.paths, "/api/v1/contacts", "post");
    const conversationMessages = operationAt(
      document.paths,
      "/api/v1/conversations/{conversationId}/messages",
      "get"
    );

    expect(openApiGet.security).toEqual([]);
    expect(openApiGet["x-required-scopes"]).toBeUndefined();
    expect(contactCreate.security).toEqual([{ BearerAuth: [] }]);
    expect(contactCreate["x-required-scopes"]).toEqual(["contacts:write"]);
    expect(contactCreate.parameters).toContainEqual({
      $ref: "#/components/parameters/IdempotencyKey"
    });
    expect(conversationMessages["x-required-scopes"]).toEqual([
      "conversations:read",
      "messages:read"
    ]);
    expect(conversationMessages.parameters).toEqual(
      expect.arrayContaining([
        { $ref: "#/components/parameters/Limit" },
        { $ref: "#/components/parameters/Cursor" }
      ])
    );
    expect(document["x-signalstack-scope-catalog"]).toEqual(API_SCOPES);
  });

  it("documents canonical envelopes, rate headers, webhook signatures, and replay resources", () => {
    const document = createPublicApiOpenApiDocument();
    const components = document.components as JsonObject;
    const schemas = components.schemas as JsonObject;
    const headers = components.headers as JsonObject;
    const responses = components.responses as JsonObject;
    const webhooks = document.webhooks as JsonObject;
    const lifecycle = webhooks.customerLifecycleEvent as JsonObject;
    const receive = lifecycle.post as JsonObject;

    expect(schemas).toMatchObject({
      ResponseMeta: expect.any(Object),
      PaginationMeta: expect.any(Object),
      ErrorEnvelope: expect.any(Object),
      Organization: expect.any(Object),
      Contact: expect.any(Object),
      Segment: expect.any(Object),
      Campaign: expect.any(Object),
      Conversation: expect.any(Object),
      ApiCredential: expect.any(Object),
      CustomerWebhookEvent: expect.any(Object),
      WebhookDelivery: expect.any(Object),
      WebhookDeliveryAttempt: expect.any(Object)
    });
    expect(
      (((schemas.ApiCredential as JsonObject).properties as JsonObject).prefix as JsonObject)
    ).toMatchObject({
      minLength: 19,
      maxLength: 19,
      pattern: "^ss_api_[A-Za-z0-9_-]{12}$"
    });
    expect(
      (((schemas.WebhookDelivery as JsonObject).properties as JsonObject).status as JsonObject)
        .enum
    ).toContain("CANCELED");
    expect(
      (((schemas.WebhookDelivery as JsonObject).properties as JsonObject).status as JsonObject)
        .enum
    ).not.toContain("CANCELLED");
    expect(
      ((schemas.WebhookDelivery as JsonObject).properties as JsonObject).attempts
    ).toMatchObject({
      type: "array",
      maxItems: 12,
      items: { $ref: "#/components/schemas/WebhookDeliveryAttempt" }
    });
    expect(headers).toMatchObject({
      XRequestId: expect.any(Object),
      RateLimitLimit: expect.any(Object),
      RateLimitRemaining: expect.any(Object),
      RateLimitReset: expect.any(Object),
      RetryAfter: expect.any(Object),
      Allow: expect.any(Object),
      IdempotencyReplayed: expect.any(Object)
    });
    expect(responses.Error405).toMatchObject({
      headers: { Allow: { $ref: "#/components/headers/Allow" } },
      content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } }
    });
    expect(receive.security).toEqual([{ CustomerWebhookSignature: [] }]);
    expect(receive["x-signature-input"]).toContain("exact raw request body");
    expect(receive.parameters).toContainEqual(
      expect.objectContaining({ name: "X-SignalStack-Secret-Version", required: true })
    );
    const webhookUrlExample = (
      (((schemas.WebhookEndpoint as JsonObject).properties as JsonObject).url as JsonObject).example
    );
    expect(typeof webhookUrlExample).toBe("string");
    expect(() => canonicalizeCustomerWebhookEndpointUrl(webhookUrlExample as string)).not.toThrow();
    expect(document.paths["/api/v1/webhook-deliveries/{deliveryId}/replay"]).toBeDefined();
  });

  it("serves the committed raw document without auth, database, or environment setup", async () => {
    const requestId = "550e8400-e29b-41d4-a716-446655440000";
    const response = await getOpenApiRoute(
      new Request("https://signalstack.example/api/v1/openapi.json", {
        headers: { "X-Request-Id": requestId }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    await expect(response.json()).resolves.toEqual(createPublicApiOpenApiDocument());
  });

  it("serves the canonical metadata 405 without authentication", async () => {
    const requestId = "550e8400-e29b-41d4-a716-446655440000";
    const response = await deleteOpenApiRoute(
      new Request("https://signalstack.example/api/v1/openapi.json", {
        method: "DELETE",
        headers: { "X-Request-Id": requestId }
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    expect(response.headers.get("RateLimit-Limit")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "METHOD_NOT_ALLOWED" },
      meta: { requestId }
    });
  });
});

function operationAt(
  paths: Record<string, JsonObject>,
  path: string,
  method: string
): JsonObject {
  const pathItem = paths[path];
  if (!pathItem) throw new Error(`Missing test path ${path}.`);
  const operation = pathItem[method];
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error(`Missing test operation ${method.toUpperCase()} ${path}.`);
  }
  return operation as JsonObject;
}
