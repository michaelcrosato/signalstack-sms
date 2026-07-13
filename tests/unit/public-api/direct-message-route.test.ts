import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createMessageRoute } from "@/app/api/v1/messages/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  readPublicApiJson: vi.fn(),
  runPublicApiIdempotentMutation: vi.fn(),
  reserveDirectMessage: vi.fn(),
  resolveDirectMessageTransport: vi.fn(() => "DUMMY"),
  serializePublicMessage: vi.fn((message) => message)
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest,
  readPublicApiJson: mocks.readPublicApiJson
}));

vi.mock("@/lib/public-api/resource-mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/resource-mutations")>()),
  runPublicApiIdempotentMutation: mocks.runPublicApiIdempotentMutation
}));

vi.mock("@/lib/messaging/direct-message-reservation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging/direct-message-reservation")>()),
  reserveDirectMessage: mocks.reserveDirectMessage,
  resolveDirectMessageTransport: mocks.resolveDirectMessageTransport
}));

vi.mock("@/lib/public-api/dummy-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/dummy-messages")>()),
  serializePublicMessage: mocks.serializePublicMessage
}));

const authorization = {
  ok: true,
  requestId: "request_1",
  principal: {
    orgId: "org_1",
    credentialId: "credential_1",
    prefix: "ss_api_test",
    scopes: ["messages:send"]
  },
  responseHeaders: {}
};

describe("public direct-message acceptance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveDirectMessageTransport.mockReturnValue("DUMMY");
    mocks.authorizePublicApiRequest.mockResolvedValue(authorization);
    mocks.readPublicApiJson.mockResolvedValue({
      contactId: "contact_1",
      body: "Hello",
      mediaUrls: ["https://cdn.example.test/a.jpg"]
    });
    mocks.runPublicApiIdempotentMutation.mockResolvedValue(new Response("{}", { status: 202 }));
  });

  it("reserves inside the response-idempotency transaction and returns Location", async () => {
    const tx = {
      message: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "message_1" }) }
    };
    mocks.reserveDirectMessage.mockResolvedValue({
      ok: true,
      deduped: false,
      message: { id: "message_1" }
    });
    const request = new Request("http://localhost/api/v1/messages", {
      method: "POST",
      headers: { "Idempotency-Key": "message-once" }
    });

    const response = await createMessageRoute(request);
    expect(response.status).toBe(202);
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    const snapshot = await mutation(tx);

    expect(mocks.reserveDirectMessage).toHaveBeenCalledWith(tx, {
      orgId: "org_1",
      route: "public_direct",
      identity: {
        kind: "public_api",
        credentialId: "credential_1",
        idempotencyKey: "message-once"
      },
      transport: "DUMMY",
      contactId: "contact_1",
      body: "Hello",
      mediaUrls: ["https://cdn.example.test/a.jpg"]
    });
    expect(snapshot).toMatchObject({
      status: 202,
      headers: { Location: "/api/v1/messages/message_1" },
      body: { ok: true, data: { message: { id: "message_1" } } }
    });
  });

  it("maps a permanent domain binding mismatch to idempotency conflict", async () => {
    mocks.reserveDirectMessage.mockResolvedValue({ ok: false, kind: "conflict" });
    const request = new Request("http://localhost/api/v1/messages", {
      method: "POST",
      headers: { "Idempotency-Key": "message-once" }
    });

    await createMessageRoute(request);
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    const snapshot = await mutation({});
    expect(snapshot).toMatchObject({
      status: 409,
      body: { ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } }
    });
  });

  it("authorizes the external-impact scope before reading input", async () => {
    const denied = {
      ok: false,
      requestId: "denied",
      response: new Response("{}", { status: 401 })
    };
    mocks.authorizePublicApiRequest.mockResolvedValue(denied);
    const response = await createMessageRoute(
      new Request("http://localhost/api/v1/messages", { method: "POST", body: "{" })
    );

    expect(response.status).toBe(401);
    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), ["messages:send"]);
    expect(mocks.readPublicApiJson).not.toHaveBeenCalled();
  });
});
