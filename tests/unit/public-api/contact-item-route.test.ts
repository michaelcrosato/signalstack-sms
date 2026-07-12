import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/v1/contacts/[contactId]/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  readPublicApiJson: vi.fn(),
  runPublicApiIdempotentMutation: vi.fn(),
  getContact: vi.fn(),
  updateContact: vi.fn(),
  archiveContact: vi.fn(),
  enqueueCustomerWebhookEvent: vi.fn()
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

vi.mock("@/lib/db/repositories/contacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/repositories/contacts")>()),
  getContact: mocks.getContact,
  updateContact: mocks.updateContact,
  archiveContact: mocks.archiveContact
}));

vi.mock("@/lib/integrations/customer-webhooks/outbox", () => ({
  enqueueCustomerWebhookEvent: mocks.enqueueCustomerWebhookEvent
}));

const now = new Date("2026-07-10T01:02:03.000Z");
const contact = {
  id: "contact_demo",
  phone: "+15555550100",
  email: null,
  firstName: null,
  lastName: null,
  displayName: "Demo",
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

describe("public contact item mutation events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue({
      ok: true,
      requestId: "req_contact_item",
      principal: { orgId: "org_demo", credentialId: "credential_demo", prefix: "ss_api_demo", scopes: ["contacts:write"] },
      responseHeaders: {}
    });
    mocks.runPublicApiIdempotentMutation.mockResolvedValue(new Response("{}"));
    mocks.getContact.mockResolvedValue(contact);
    mocks.updateContact.mockResolvedValue({ ...contact, displayName: "Updated" });
    mocks.archiveContact.mockResolvedValue({ ...contact, archivedAt: now });
    mocks.enqueueCustomerWebhookEvent.mockResolvedValue({ created: true, deliveryCount: 1 });
  });

  it("enqueues contact.updated in the same transaction as PATCH", async () => {
    const tx = { marker: "patch-transaction" };
    mocks.readPublicApiJson.mockResolvedValue({ displayName: "Updated" });
    await PATCH(
      new Request("http://localhost/api/v1/contacts/contact_demo", {
        method: "PATCH",
        headers: { "Idempotency-Key": "contact-patch-0001" }
      }),
      { params: Promise.resolve({ contactId: "contact_demo" }) }
    );
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    await mutation(tx);

    expect(mocks.updateContact).toHaveBeenCalledWith(
      "org_demo",
      "contact_demo",
      { displayName: "Updated" },
      tx
    );
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "contact.updated", aggregateId: "contact_demo" })
    );
  });

  it("soft-archives and enqueues contact.archived in the same transaction as DELETE", async () => {
    const tx = { marker: "delete-transaction" };
    await DELETE(
      new Request("http://localhost/api/v1/contacts/contact_demo", {
        method: "DELETE",
        headers: { "Idempotency-Key": "contact-delete-001" }
      }),
      { params: Promise.resolve({ contactId: "contact_demo" }) }
    );
    const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
    await mutation(tx);

    expect(mocks.archiveContact).toHaveBeenCalledWith("org_demo", "contact_demo", tx);
    expect(mocks.enqueueCustomerWebhookEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "contact.archived", aggregateId: "contact_demo" })
    );
  });
});
