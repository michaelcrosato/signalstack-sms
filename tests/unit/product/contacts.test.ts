import { ConsentStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getProductContactDetail, getProductContacts } from "@/lib/product/contacts";

vi.mock("@/lib/db/repositories/contacts", () => ({
  listArchivedContacts: vi.fn(async () => [
    {
      id: "contact_archived",
      displayName: "Archived Buyer",
      firstName: "Archived",
      lastName: "Buyer",
      phone: "+15555550109",
      email: "archived@example.com",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "manual",
      source: "demo",
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      tagLinks: [{ tag: { name: "archive" } }],
      listLinks: [{ list: { name: "Dormant" } }]
    }
  ]),
  getContact: vi.fn(async (_orgId: string, contactId: string) => {
    if (contactId === "missing") {
      return null;
    }

    return {
      id: contactId,
      displayName: null,
      firstName: "Katherine",
      lastName: "Johnson",
      phone: "+15555550104",
      email: "katherine@example.com",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "event_signup",
      source: "demo",
      notes: "Prefers morning reminders.",
      archivedAt: null,
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      tagLinks: [{ tag: { name: "vip" } }, { tag: { name: "alpha" } }],
      listLinks: [{ list: { name: "Customers" } }]
    };
  }),
  listContacts: vi.fn(async () => [
    {
      id: "contact_2",
      displayName: null,
      firstName: "Grace",
      lastName: "Hopper",
      phone: "+15555550102",
      email: "grace@example.com",
      consentStatus: ConsentStatus.UNKNOWN,
      optInSource: null,
      source: "manual",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      tagLinks: [{ tag: { name: "beta" } }, { tag: { name: "alpha" } }],
      listLinks: [{ list: { name: "Leads" } }]
    },
    {
      id: "contact_1",
      displayName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+15555550100",
      email: "ada@example.com",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "demo_seed",
      source: "seed",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      tagLinks: [],
      listLinks: []
    },
    {
      id: "contact_3",
      displayName: null,
      firstName: null,
      lastName: null,
      phone: "+15555550103",
      email: null,
      consentStatus: ConsentStatus.OPTED_OUT,
      optInSource: null,
      source: null,
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      tagLinks: [],
      listLinks: []
    }
  ])
}));

describe("getProductContacts", () => {
  it("builds contact summary and display rows for the product contacts page", async () => {
    const result = await getProductContacts("org_1");

    expect(result.summary).toEqual({
      total: 3,
      archived: 1,
      optedIn: 1,
      optedOut: 1,
      unknown: 1
    });
    expect(result.contacts.map((contact) => contact.displayName)).toEqual([
      "Grace Hopper",
      "Ada Lovelace",
      "+15555550103"
    ]);
    expect(result.contacts[0].tags).toEqual(["alpha", "beta"]);
    expect(result.contacts[0].lists).toEqual(["Leads"]);
    expect(result.archivedContacts).toHaveLength(1);
    expect(result.archivedContacts[0]).toMatchObject({
      displayName: "Archived Buyer",
      lists: ["Dormant"]
    });
  });

  it("builds a detail row for the product contact edit page", async () => {
    const contact = await getProductContactDetail("org_1", "contact_4");

    expect(contact).toMatchObject({
      id: "contact_4",
      displayName: "Katherine Johnson",
      firstName: "Katherine",
      lastName: "Johnson",
      phone: "+15555550104",
      email: "katherine@example.com",
      consentStatus: ConsentStatus.OPTED_IN,
      optInSource: "event_signup",
      source: "demo",
      notes: "Prefers morning reminders.",
      tags: ["alpha", "vip"],
      lists: ["Customers"],
      archived: false
    });
  });

  it("returns null when the product contact detail is outside the tenant", async () => {
    await expect(getProductContactDetail("org_1", "missing")).resolves.toBeNull();
  });
});
