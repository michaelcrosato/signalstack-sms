import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancelMessageRoute } from "@/app/api/v1/messages/[messageId]/cancel/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  runPublicApiIdempotentMutation: vi.fn(),
  cancelDirectMessage: vi.fn(),
  serializePublicMessage: vi.fn((message) => message)
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest
}));

vi.mock("@/lib/public-api/resource-mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/resource-mutations")>()),
  runPublicApiIdempotentMutation: mocks.runPublicApiIdempotentMutation
}));

vi.mock("@/lib/messaging/direct-message-cancellation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging/direct-message-cancellation")>()),
  cancelDirectMessage: mocks.cancelDirectMessage
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

const fakeTx = { message: { findUniqueOrThrow: vi.fn() } };

function cancelRequest() {
  return new Request("http://localhost/api/v1/messages/message_1/cancel", { method: "POST" });
}
const routeContext = { params: Promise.resolve({ messageId: "message_1" }) };

describe("public message-cancel route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue(authorization);
    fakeTx.message.findUniqueOrThrow.mockResolvedValue({ id: "message_1" });
    // Invoke the mutation callback with a fake tx and surface its snapshot status.
    mocks.runPublicApiIdempotentMutation.mockImplementation(
      async (_req: unknown, _auth: unknown, _key: unknown, _params: unknown, cb: (tx: unknown) => Promise<{ status: number }>) => {
        const snapshot = await cb(fakeTx);
        return new Response(null, { status: snapshot.status });
      }
    );
  });

  it("returns 404 when the message does not exist", async () => {
    mocks.cancelDirectMessage.mockResolvedValue({ ok: false, kind: "not_found" });
    const res = await cancelMessageRoute(cancelRequest(), routeContext);
    expect(res.status).toBe(404);
  });

  it("returns 422 (not 409) when the message can no longer be cancelled", async () => {
    // OPERATION_NOT_ALLOWED is bound to 422 in the error catalog and used by the campaign-cancel sibling;
    // this route must not diverge with a 409.
    mocks.cancelDirectMessage.mockResolvedValue({ ok: false, kind: "already_terminal" });
    const res = await cancelMessageRoute(cancelRequest(), routeContext);
    expect(res.status).toBe(422);
  });

  it("returns 200 on a successful cancellation", async () => {
    mocks.cancelDirectMessage.mockResolvedValue({ ok: true, message: { id: "message_1" } });
    const res = await cancelMessageRoute(cancelRequest(), routeContext);
    expect(res.status).toBe(200);
  });
});
