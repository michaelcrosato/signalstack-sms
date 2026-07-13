import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PublicApiCursorError } from "@/lib/public-api/cursor";
import {
  createPublicApiPage,
  parsePublicApiCollectionQuery,
  publicApiCursorWhere
} from "@/lib/public-api/resource-pagination";
import { PublicApiRequestError } from "@/lib/public-api/request";

const pepper = "resource-pagination-pepper-that-is-long-enough";
const originalPepper = process.env.API_KEY_PEPPER;

describe("public API resource pagination", () => {
  beforeEach(() => {
    process.env.API_KEY_PEPPER = pepper;
  });

  afterEach(() => {
    if (originalPepper === undefined) delete process.env.API_KEY_PEPPER;
    else process.env.API_KEY_PEPPER = originalPepper;
  });

  it("defaults to a bounded page and issues a tenant/resource-bound keyset cursor", () => {
    const binding = { orgId: "org_demo", resource: "contacts" };
    const query = parsePublicApiCollectionQuery(
      new Request("http://localhost/api/v1/contacts?limit=2"),
      binding
    );
    const page = createPublicApiPage(
      [
        { id: "contact_c", createdAt: new Date("2026-07-10T03:00:00.000Z") },
        { id: "contact_b", createdAt: new Date("2026-07-10T02:00:00.000Z") },
        { id: "contact_a", createdAt: new Date("2026-07-10T01:00:00.000Z") }
      ],
      query,
      binding
    );

    expect(page.rows.map((row) => row.id)).toEqual(["contact_c", "contact_b"]);
    expect(page.pagination).toMatchObject({ limit: 2, hasMore: true });
    expect(page.pagination.nextCursor).toEqual(expect.any(String));

    const next = parsePublicApiCollectionQuery(
      new Request(`http://localhost/api/v1/contacts?limit=2&cursor=${page.pagination.nextCursor}`),
      binding
    );
    expect(next.cursor).toEqual({ id: "contact_b", createdAt: new Date("2026-07-10T02:00:00.000Z") });
    expect(publicApiCursorWhere(next.cursor)).toEqual({
      OR: [
        { createdAt: { lt: new Date("2026-07-10T02:00:00.000Z") } },
        { createdAt: new Date("2026-07-10T02:00:00.000Z"), id: { lt: "contact_b" } }
      ]
    });

    expect(() =>
      parsePublicApiCollectionQuery(
        new Request(`http://localhost/api/v1/tags?cursor=${page.pagination.nextCursor}`),
        { orgId: "org_demo", resource: "tags" }
      )
    ).toThrow(PublicApiCursorError);
  });

  it("rejects unbounded, unknown, and repeated collection parameters", () => {
    expect(() =>
      parsePublicApiCollectionQuery(
        new Request("http://localhost/api/v1/contacts?limit=101"),
        { orgId: "org_demo", resource: "contacts" }
      )
    ).toThrow();
    expect(() =>
      parsePublicApiCollectionQuery(
        new Request("http://localhost/api/v1/contacts?offset=10"),
        { orgId: "org_demo", resource: "contacts" }
      )
    ).toThrow();
    expect(() =>
      parsePublicApiCollectionQuery(
        new Request("http://localhost/api/v1/contacts?limit=2&limit=3"),
        { orgId: "org_demo", resource: "contacts" }
      )
    ).toThrow(PublicApiRequestError);
  });

  it("uses the documented default page size", () => {
    expect(
      parsePublicApiCollectionQuery(
        new Request("http://localhost/api/v1/contacts"),
        { orgId: "org_demo", resource: "contacts" }
      )
    ).toEqual({ limit: 50, cursor: null });
  });
});
