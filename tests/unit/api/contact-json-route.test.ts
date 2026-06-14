import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postContact } from "@/app/api/contacts/route";
import { PATCH as patchContact } from "@/app/api/contacts/[contactId]/route";
import { POST as mergeContact } from "@/app/api/contacts/[contactId]/merge/route";
import { POST as importContactsRoute } from "@/app/api/contacts/imports/route";

const mocks = vi.hoisted(() => ({
  archiveContact: vi.fn(),
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

describe("contact JSON mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({ orgId: "org_demo", userId: "user_demo", role: "OWNER" });
    mocks.requireApiRole.mockReturnValue(null);
  });

  it("rejects malformed create JSON without upserting a local contact", async () => {
    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  it("rejects malformed update JSON without updating a tenant contact", async () => {
    const response = await patchContact(
      new Request("http://localhost/api/contacts/contact_demo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
