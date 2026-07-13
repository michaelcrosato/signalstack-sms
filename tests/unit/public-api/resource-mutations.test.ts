import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertPublicApiRequestHasNoBody,
  publicApiSuccessSnapshot,
  runPublicApiIdempotentMutation,
  toPublicApiJson
} from "@/lib/public-api/resource-mutations";

const mocks = vi.hoisted(() => ({
  withTenantTransaction: vi.fn(),
  executeIdempotentMutation: vi.fn()
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: mocks.withTenantTransaction
}));

vi.mock("@/lib/public-api/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/idempotency")>()),
  executeIdempotentMutation: mocks.executeIdempotentMutation
}));

describe("public API resource mutation transaction wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unsupported DELETE bodies instead of excluding them from the idempotency binding", async () => {
    await expect(
      assertPublicApiRequestHasNoBody(
        new Request("http://localhost/api/v1/tags/tag_demo", {
          method: "DELETE",
          body: "{}"
        })
      )
    ).rejects.toThrow("This request must not include a body.");
    await expect(
      assertPublicApiRequestHasNoBody(
        new Request("http://localhost/api/v1/tags/tag_demo", { method: "DELETE" })
      )
    ).resolves.toBeUndefined();
    await expect(
      assertPublicApiRequestHasNoBody(
        new Request("http://localhost/api/v1/tags/tag_demo", {
          method: "DELETE",
          body: ""
        })
      )
    ).resolves.toBeUndefined();
  });

  it("passes one tenant transaction through idempotency and the domain mutation", async () => {
    const tx = { marker: "same-transaction" };
    const mutation = vi.fn().mockResolvedValue(
      publicApiSuccessSnapshot(toPublicApiJson({ id: "contact_demo" }), "req_original", 201, {
        location: "/api/v1/contacts/contact_demo"
      })
    );
    mocks.withTenantTransaction.mockImplementation(async (_context, operation) => operation(tx));
    mocks.executeIdempotentMutation.mockImplementation(async (receivedTx, context, operation) => {
      expect(receivedTx).toBe(tx);
      expect(context).toMatchObject({
        orgId: "org_demo",
        credentialId: "credential_demo",
        idempotencyKey: "contact-create-0001",
        method: "POST",
        canonicalRoute: "/api/v1/contacts",
        requestBody: { phone: "+15555550100" }
      });
      const snapshot = await operation();
      return { replayed: false, status: snapshot.status, body: snapshot.body, headers: snapshot.headers ?? {} };
    });

    const response = await runPublicApiIdempotentMutation(
      new Request("http://localhost/api/v1/contacts", {
        method: "POST",
        headers: { "Idempotency-Key": "contact-create-0001" }
      }),
      {
        ok: true,
        requestId: "req_original",
        principal: { orgId: "org_demo", credentialId: "credential_demo", prefix: "ss_api_demo", scopes: ["contacts:write"] },
        responseHeaders: { "RateLimit-Remaining": "9" }
      },
      "/api/v1/contacts",
      { phone: "+15555550100" },
      mutation
    );

    expect(mocks.withTenantTransaction).toHaveBeenCalledWith({ orgId: "org_demo" }, expect.any(Function));
    expect(mutation).toHaveBeenCalledWith(tx);
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe("/api/v1/contacts/contact_demo");
    expect(response.headers.get("idempotency-replayed")).toBe("false");
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { id: "contact_demo" }, meta: { requestId: "req_original" } });
  });

  it("returns the exact stored status and body on replay", async () => {
    const storedBody = { ok: true, data: { id: "tag_demo" }, meta: { requestId: "req_original" } };
    mocks.withTenantTransaction.mockImplementation(async (_context, operation) => operation({}));
    mocks.executeIdempotentMutation.mockResolvedValue({
      replayed: true,
      status: 201,
      body: storedBody,
      headers: { location: "/api/v1/tags/tag_demo" }
    });

    const response = await runPublicApiIdempotentMutation(
      new Request("http://localhost/api/v1/tags", { method: "POST", headers: { "Idempotency-Key": "tag-create-000001" } }),
      {
        ok: true,
        requestId: "req_replay",
        principal: { orgId: "org_demo", credentialId: "credential_demo", prefix: "ss_api_demo", scopes: ["tags:write"] },
        responseHeaders: {}
      },
      "/api/v1/tags",
      { name: "VIP" },
      vi.fn()
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req_original");
    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(await response.json()).toEqual(storedBody);
  });
});
