import { ConsentStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET as getListContacts,
  POST as addListContacts
} from "@/app/api/v1/lists/[listId]/contacts/route";
import { DELETE as removeListContact } from "@/app/api/v1/lists/[listId]/contacts/[contactId]/route";
import { GET as getSegmentContacts } from "@/app/api/v1/segments/[segmentId]/contacts/route";

const mocks = vi.hoisted(() => ({
  authorizePublicApiRequest: vi.fn(),
  readPublicApiJson: vi.fn(),
  withTenantTransaction: vi.fn(),
  runPublicApiIdempotentMutation: vi.fn()
}));

vi.mock("@/lib/public-api/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/request")>()),
  authorizePublicApiRequest: mocks.authorizePublicApiRequest,
  readPublicApiJson: mocks.readPublicApiJson
}));

vi.mock("@/lib/db/tenant-context", () => ({
  withTenantTransaction: mocks.withTenantTransaction
}));

vi.mock("@/lib/public-api/resource-mutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-api/resource-mutations")>()),
  runPublicApiIdempotentMutation: mocks.runPublicApiIdempotentMutation
}));

const originalPepper = process.env.API_KEY_PEPPER;
let activeTx: Record<string, unknown>;

const firstContact = contactRow("contact_b", "2026-07-10T02:00:00.000Z");
const secondContact = contactRow("contact_a", "2026-07-10T01:00:00.000Z");

describe("public audience routes", () => {
  beforeAll(() => {
    process.env.API_KEY_PEPPER = "audience-route-pagination-pepper-that-is-long-enough";
  });

  afterAll(() => {
    if (originalPepper === undefined) delete process.env.API_KEY_PEPPER;
    else process.env.API_KEY_PEPPER = originalPepper;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePublicApiRequest.mockResolvedValue(authorized());
    mocks.withTenantTransaction.mockImplementation(async (_context, operation) => operation(activeTx));
    mocks.runPublicApiIdempotentMutation.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  describe("list membership", () => {
    it("authorizes both read scopes and returns a bounded named contact page", async () => {
      const listFindFirst = vi.fn().mockResolvedValue({ id: "list_demo" });
      const archivedAt = new Date("2026-07-11T01:00:00.000Z");
      const contactFindMany = vi.fn().mockResolvedValue([{ ...firstContact, archivedAt }]);
      activeTx = {
        contactList: { findFirst: listFindFirst },
        contact: { findMany: contactFindMany }
      };

      const response = await getListContacts(
        new Request("http://localhost/api/v1/lists/list_demo/contacts"),
        { params: Promise.resolve({ listId: "list_demo" }) }
      );

      expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
        "lists:read",
        "contacts:read"
      ]);
      expect(mocks.withTenantTransaction).toHaveBeenCalledWith(
        { orgId: "org_demo" },
        expect.any(Function)
      );
      expect(contactFindMany).toHaveBeenCalledWith({
        where: {
          orgId: "org_demo",
          listLinks: { some: { orgId: "org_demo", listId: "list_demo" } }
        },
        select: expect.any(Object),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        data: { contacts: [{ id: "contact_b", archivedAt: archivedAt.toISOString() }] },
        meta: { limit: 50, hasMore: false, nextCursor: null, requestId: "req_audience" }
      });
    });

    it("authenticates before reading or validating a membership body", async () => {
      mocks.authorizePublicApiRequest.mockResolvedValue({
        ok: false,
        requestId: "req_denied",
        response: new Response("{}", { status: 401 })
      });

      const response = await addListContacts(
        new Request("http://localhost/api/v1/lists/list_demo/contacts", { method: "POST" }),
        { params: Promise.resolve({ listId: "list_demo" }) }
      );

      expect(response.status).toBe(401);
      expect(mocks.readPublicApiJson).not.toHaveBeenCalled();
      expect(mocks.runPublicApiIdempotentMutation).not.toHaveBeenCalled();
    });

    it("atomically validates tenant contacts and inserts only missing memberships", async () => {
      const requestBody = { contactIds: ["contact_a", "contact_b"] };
      mocks.readPublicApiJson.mockResolvedValue(requestBody);
      await addListContacts(
        new Request("http://localhost/api/v1/lists/list_demo/contacts", {
          method: "POST",
          headers: { "Idempotency-Key": "list-members-0001" }
        }),
        { params: Promise.resolve({ listId: "list_demo" }) }
      );
      expect(mocks.runPublicApiIdempotentMutation).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({ requestId: "req_audience" }),
        "/api/v1/lists/list_demo/contacts",
        requestBody,
        expect.any(Function)
      );

      const tx = {
        contactList: { findFirst: vi.fn().mockResolvedValue({ id: "list_demo" }) },
        contact: {
          findMany: vi.fn().mockResolvedValue([{ id: "contact_a" }, { id: "contact_b" }])
        },
        contactListMember: { createMany: vi.fn().mockResolvedValue({ count: 1 }) }
      };
      const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
      const snapshot = await mutation(tx);

      expect(tx.contactList.findFirst).toHaveBeenCalledWith({
        where: { orgId: "org_demo", id: "list_demo" },
        select: { id: true }
      });
      expect(tx.contact.findMany).toHaveBeenCalledWith({
        where: { orgId: "org_demo", id: { in: ["contact_a", "contact_b"] } },
        select: { id: true }
      });
      expect(tx.contactListMember.createMany).toHaveBeenCalledWith({
        data: [
          { orgId: "org_demo", listId: "list_demo", contactId: "contact_a" },
          { orgId: "org_demo", listId: "list_demo", contactId: "contact_b" }
        ],
        skipDuplicates: true
      });
      expect(snapshot).toMatchObject({
        status: 200,
        body: {
          data: {
            membership: {
              listId: "list_demo",
              contactIds: ["contact_a", "contact_b"],
              addedCount: 1
            }
          }
        }
      });
    });

    it("uses the same generic not-found result for a missing list or any non-tenant contact", async () => {
      const requestBody = { contactIds: ["contact_a", "contact_b"] };
      mocks.readPublicApiJson.mockResolvedValue(requestBody);
      await addListContacts(
        new Request("http://localhost/api/v1/lists/list_demo/contacts", { method: "POST" }),
        { params: Promise.resolve({ listId: "list_demo" }) }
      );
      const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
      const missingList = await mutation({
        contactList: { findFirst: vi.fn().mockResolvedValue(null) },
        contact: { findMany: vi.fn().mockResolvedValue([{ id: "contact_a" }, { id: "contact_b" }]) }
      });
      const missingContact = await mutation({
        contactList: { findFirst: vi.fn().mockResolvedValue({ id: "list_demo" }) },
        contact: { findMany: vi.fn().mockResolvedValue([{ id: "contact_a" }]) }
      });

      expect(missingList).toEqual(missingContact);
      expect(missingList).toMatchObject({
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "The requested resource was not found." } }
      });
    });

    it("removes one same-tenant membership inside the idempotent transaction", async () => {
      await removeListContact(
        new Request("http://localhost/api/v1/lists/list_demo/contacts/contact_a", {
          method: "DELETE",
          headers: { "Idempotency-Key": "list-member-delete-1" }
        }),
        { params: Promise.resolve({ listId: "list_demo", contactId: "contact_a" }) }
      );
      const tx = {
        contactListMember: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) }
      };
      const mutation = mocks.runPublicApiIdempotentMutation.mock.calls[0]?.[4];
      const snapshot = await mutation(tx);

      expect(tx.contactListMember.deleteMany).toHaveBeenCalledWith({
        where: { orgId: "org_demo", listId: "list_demo", contactId: "contact_a" }
      });
      expect(snapshot).toMatchObject({
        status: 200,
        body: {
          data: {
            membership: { listId: "list_demo", contactId: "contact_a", removed: true }
          }
        }
      });
    });
  });

  describe("saved-segment evaluation", () => {
    it("validates the stored filter, evaluates it, and binds the cursor to the segment", async () => {
      const segmentFindFirst = vi.fn().mockResolvedValue({
        id: "segment_a",
        definition: {
          tagNames: ["VIP"],
          consentStatuses: [ConsentStatus.OPTED_IN],
          minLeadScore: 20,
          maxLeadScore: 80
        }
      });
      const contactFindMany = vi.fn().mockResolvedValue([firstContact, secondContact]);
      activeTx = {
        segment: { findFirst: segmentFindFirst },
        contact: { findMany: contactFindMany }
      };

      const firstResponse = await getSegmentContacts(
        new Request("http://localhost/api/v1/segments/segment_a/contacts?limit=1"),
        { params: Promise.resolve({ segmentId: "segment_a" }) }
      );
      const firstBody = await firstResponse.json();

      expect(mocks.authorizePublicApiRequest).toHaveBeenCalledWith(expect.any(Request), [
        "segments:read",
        "contacts:read"
      ]);
      expect(contactFindMany).toHaveBeenCalledWith({
        where: {
          orgId: "org_demo",
          archivedAt: null,
          consentStatus: { in: [ConsentStatus.OPTED_IN] },
          leadScore: { gte: 20, lte: 80 },
          tagLinks: {
            some: { orgId: "org_demo", tag: { name: { in: ["VIP"] } } }
          }
        },
        select: expect.any(Object),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2
      });
      expect(firstBody).toMatchObject({
        ok: true,
        data: { contacts: [{ id: "contact_b" }] },
        meta: { limit: 1, hasMore: true, nextCursor: expect.any(String) }
      });

      mocks.withTenantTransaction.mockClear();
      const foreignCursorResponse = await getSegmentContacts(
        new Request(
          `http://localhost/api/v1/segments/segment_b/contacts?limit=1&cursor=${firstBody.meta.nextCursor}`
        ),
        { params: Promise.resolve({ segmentId: "segment_b" }) }
      );
      expect(foreignCursorResponse.status).toBe(400);
      await expect(foreignCursorResponse.json()).resolves.toMatchObject({
        error: { code: "INVALID_CURSOR" }
      });
      expect(mocks.withTenantTransaction).not.toHaveBeenCalled();
    });

    it("returns a generic not-found response without evaluating a missing or foreign segment", async () => {
      const contactFindMany = vi.fn();
      activeTx = {
        segment: { findFirst: vi.fn().mockResolvedValue(null) },
        contact: { findMany: contactFindMany }
      };

      const response = await getSegmentContacts(
        new Request("http://localhost/api/v1/segments/segment_foreign/contacts"),
        { params: Promise.resolve({ segmentId: "segment_foreign" }) }
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "NOT_FOUND", message: "The requested resource was not found." }
      });
      expect(contactFindMany).not.toHaveBeenCalled();
    });

    it("fails closed without querying contacts when a stored definition is invalid", async () => {
      const contactFindMany = vi.fn();
      activeTx = {
        segment: {
          findFirst: vi.fn().mockResolvedValue({
            id: "segment_invalid",
            definition: { tagNames: [], unexpected: "unsafe" }
          })
        },
        contact: { findMany: contactFindMany }
      };

      const response = await getSegmentContacts(
        new Request("http://localhost/api/v1/segments/segment_invalid/contacts"),
        { params: Promise.resolve({ segmentId: "segment_invalid" }) }
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INTERNAL_ERROR", message: "An internal error occurred." }
      });
      expect(contactFindMany).not.toHaveBeenCalled();
    });
  });
});

function authorized() {
  return {
    ok: true as const,
    requestId: "req_audience",
    principal: {
      orgId: "org_demo",
      credentialId: "credential_demo",
      prefix: "ss_api_demo",
      scopes: ["lists:read", "lists:write", "contacts:read", "segments:read"]
    },
    responseHeaders: {}
  };
}

function contactRow(id: string, createdAt: string) {
  const timestamp = new Date(createdAt);
  return {
    id,
    phone: "+15555550100",
    email: null,
    firstName: null,
    lastName: null,
    displayName: id,
    consentStatus: ConsentStatus.OPTED_IN,
    optInSource: "api",
    optInAt: timestamp,
    optedOutAt: null,
    consentCapturedAt: timestamp,
    consentMethod: "api",
    consentDisclosure: "I agree",
    source: "api",
    notes: null,
    leadScore: 50,
    leadStage: null,
    leadQualifiedAt: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    tagLinks: [],
    listLinks: []
  };
}
