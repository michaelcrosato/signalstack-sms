import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createContactRoute } from "@/app/api/v1/contacts/route";
import { ContactConsentEvidenceError } from "@/lib/db/repositories/contacts";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  readPublicApiJson: vi.fn(),
  createContact: vi.fn(),
  enqueueCustomerWebhookEvent: vi.fn(),
  runPublicApiIdempotentMutation: vi.fn()
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest,
  readPublicApiJson: mocks.readPublicApiJson
}));

vi.mock("@/lib/db/repositories/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/repositories/contacts")>()),
  createContact: mocks.createContact
}));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

vi.mock("@/lib/public-api/resource-mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/resource-mutations")>()),
  runPublicApiIdempotentMutation: mocks.runPublicApiIdempotentMutation
}));

describe("public resource route authentication order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: false,
      requestId: "req_denied",
      response: new Response(JSON.stringify({ denied: true }), { status: 401 })
    });
  });

  it("authorizes the exact write scope before touching an untrusted request body", async () => {
    const response = await createContactRoute(
      new Request("http://localhost/api/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{malformed"
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), ["contacts:write"]);
    expect(mocks.readPublicApiJson).not.toHaveBeenCalled();
    expect(mocks.createContact).not.toHaveBeenCalled();
    expect(mocks.enqueueCustomerWebhookEvent).not.toHaveBeenCalled();
  });

  it("hashes the validated raw JSON rather than its Date-coerced contact model", async () => {
    const rawBody = {
      phone: "+15555550100",
      consentCapturedAt: "2026-07-10T01:02:03.000Z",
      consentMethod: "checkbox",
      consentDisclosure: "I agree"
    };
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: true,
      requestId: "req_authorized",
      principal: { orgId: "org_demo", credentialId: "credential_demo", prefix: "ss_api_demo", scopes: ["contacts:write"] },
      responseHeaders: {}
    });
    mocks.readPublicApiJson.mockResolvedValue(rawBody);
    mocks.runPublicApiIdempotentMutation.mockResolvedValue(new Response("{}", { status: 201 }));

    await createContactRoute(new Request("http://localhost/api/v1/contacts", { method: "POST" }));

    expect(mocks.runPublicApiIdempotentMutation).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ requestId: "req_authorized" }),
      "/api/v1/contacts",
      rawBody,
      expect.any(Function)
    );
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    const tx = { marker: "same-transaction" };
    mocks.createContact.mockRejectedValue(
      new ContactConsentEvidenceError(
        "Consent evidence requires capturedAt, method, and disclosure together"
      )
    );
    const snapshot = await mutation(tx);
    expect(mocks.createContact).toHaveBeenCalledWith(
      "org_demo",
      expect.objectContaining({ consentCapturedAt: new Date(rawBody.consentCapturedAt) }),
      tx
    );
    expect(snapshot).toMatchObject({ status: 422, body: { error: { code: "OPERATION_NOT_ALLOWED" } } });
    expect(mocks.enqueueCustomerWebhookEvent).not.toHaveBeenCalled();
  });

  it("creates the contact and contact.created outbox event with the same transaction", async () => {
    const tx = { marker: "same-transaction" };
    const now = new Date("2026-07-10T01:02:03.000Z");
    const contact = {
      id: "contact_demo",
      phone: "+15555550100",
      email: null,
      firstName: null,
      lastName: null,
      displayName: null,
      consentStatus: "UNKNOWN",
      optInSource: null,
      optInAt: null,
      optedOutAt: null,
      consentCapturedAt: null,
      consentMethod: null,
      consentDisclosure: null,
      source: "api",
      notes: null,
      leadScore: null,
      leadStage: null,
      leadQualifiedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      tagLinks: [],
      listLinks: []
    };
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: true,
      requestId: "req_authorized",
      principal: { orgId: "org_demo", credentialId: "credential_demo", prefix: "ss_api_demo", scopes: ["contacts:write"] },
      responseHeaders: {}
    });
    mocks.readPublicApiJson.mockResolvedValue({ phone: contact.phone, source: "api" });
    mocks.runPublicApiIdempotentMutation.mockResolvedValue(new Response("{}", { status: 201 }));
    mocks.createContact.mockResolvedValue(contact);
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({ created: true, deliveryCount: 1 });

    await createContactRoute(new Request("http://localhost/api/v1/contacts", { method: "POST" }));
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    const snapshot = await mutation(tx);

    expect(mocks.createContact).toHaveBeenCalledWith(
      "org_demo",
      expect.objectContaining({ phone: contact.phone }),
      tx
    );
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        orgId: "org_demo",
        deduplicationKey: "api:contact.created:contact_demo",
        type: "contact.created",
        aggregateType: "contact",
        aggregateId: "contact_demo"
      })
    );
    expect(snapshot).toMatchObject({ status: 201, headers: { location: "/api/v1/contacts/contact_demo" } });
  });
});
