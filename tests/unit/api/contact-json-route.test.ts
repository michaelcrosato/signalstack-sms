import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postContact } from "@/app/api/contacts/route";
import { PATCH as patchContact } from "@/app/api/contacts/[contactId]/route";
import { POST as mergeContact } from "@/app/api/contacts/[contactId]/merge/route";
import { POST as importContactsRoute } from "@/app/api/contacts/imports/route";

const mocks = vi.hoisted(() => ({
  archiveContact: vi.fn(),
  evaluatePhoneNumberLookup: vi.fn(),
  getContact: vi.fn(),
  getOrCreateCurrentOrg: vi.fn(),
  importContacts: vi.fn(),
  listContacts: vi.fn(),
  mergeContacts: vi.fn(),
  parseContactImport: vi.fn(),
  requireApiRole: vi.fn(),
  updateContact: vi.fn(),
  upsertContact: vi.fn()
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/csv/import-contacts", () => ({
  parseContactImport: mocks.parseContactImport
}));

vi.mock("@/lib/db/repositories/contacts", () => ({
  archiveContact: mocks.archiveContact,
  getContact: mocks.getContact,
  importContacts: mocks.importContacts,
  listContacts: mocks.listContacts,
  mergeContacts: mocks.mergeContacts,
  updateContact: mocks.updateContact,
  upsertContact: mocks.upsertContact
}));

vi.mock("@/lib/validation/lookup", () => ({
  evaluatePhoneNumberLookup: mocks.evaluatePhoneNumberLookup,
  liveLookupOperatorHeaderName: "x-signalstack-lookup-token"
}));

describe("contact JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
    mocks.evaluatePhoneNumberLookup.mockResolvedValue({
      valid: true,
      formattedPhone: "+15555550100",
      carrierType: "mobile"
    });
  });

  it("rejects malformed create JSON without upserting a local contact", async () => {
    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid contact payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.upsertContact).not.toHaveBeenCalled();
  });

  it("returns service unavailable without writing when explicitly requested live lookup is unavailable", async () => {
    mocks.evaluatePhoneNumberLookup.mockResolvedValue({
      valid: false,
      formattedPhone: "+15555550100",
      unavailable: true,
      error: "Live phone lookup timed out."
    });

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: JSON.stringify({ phone: "+15555550100" })
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Live phone lookup timed out." });
    expect(mocks.upsertContact).not.toHaveBeenCalled();
  });

  it.runIf(process.env.RUN_DB_TESTS === "true")("passes the dedicated lookup operator header to the paid-lookup boundary", async () => {
    const operatorToken = "lookup-operator-token-0123456789abcdef";
    mocks.upsertContact.mockResolvedValue({ id: "contact_demo", phone: "+15555550100" });

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Host: "localhost",
          "x-signalstack-lookup-token": operatorToken
        },
        body: JSON.stringify({ phone: "+15555550100" })
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.evaluatePhoneNumberLookup).toHaveBeenCalledWith("+15555550100", process.env, {
      operatorToken
    });
    expect(mocks.upsertContact).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed update JSON without updating a tenant contact", async () => {
    const response = await patchContact(
      new Request("http://localhost/api/contacts/contact_demo", {
        method: "PATCH",
        headers: sameOriginJsonHeaders(),
        body: "{"
      }),
      { params: Promise.resolve({ contactId: "contact_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid contact payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });

  it("rejects malformed merge JSON without merging tenant contacts", async () => {
    const response = await mergeContact(
      new Request("http://localhost/api/contacts/contact_demo/merge", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: "{"
      }),
      { params: Promise.resolve({ contactId: "contact_demo" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid contact merge payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.mergeContacts).not.toHaveBeenCalled();
  });

  it("rejects malformed import JSON without parsing CSV or importing contacts", async () => {
    const response = await importContactsRoute(
      new Request("http://localhost/api/contacts/imports", {
        method: "POST",
        headers: sameOriginJsonHeaders(),
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid import payload.",
      issues: [expect.objectContaining({ path: [] })]
    });
    expect(mocks.parseContactImport).not.toHaveBeenCalled();
    expect(mocks.importContacts).not.toHaveBeenCalled();
  });
});

function sameOriginJsonHeaders() {
  return { "Content-Type": "application/json", Origin: "http://localhost", Host: "localhost" };
}
