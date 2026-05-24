import { ConsentStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { productContactConsentOptions } from "@/lib/product/contact-consent-options";
import { productContactImportDefaults } from "@/lib/product/contact-import-defaults";
import {
  getProductContactDetail,
  getProductContacts,
  productContactDetailStatusRows,
  productContactMetricRows
} from "@/lib/product/contacts";

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
    expect(result.metrics).toEqual([
      { key: "total", label: "Active Contacts", value: 3 },
      { key: "optedIn", label: "Opted In", value: 1 },
      { key: "optedOut", label: "Opted Out", value: 1 },
      { key: "unknown", label: "Unknown Consent", value: 1 },
      { key: "archived", label: "Archived", value: 1 }
    ]);
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
      archived: false,
      statusRows: [
        { key: "phone", label: "Phone", value: "+15555550104" },
        { key: "consent", label: "Consent", value: ConsentStatus.OPTED_IN },
        { key: "lists", label: "Lists", value: "Customers" },
        { key: "tags", label: "Tags", value: "alpha, vip" },
        { key: "archived", label: "Archived", value: "no" }
      ],
      mergeCandidates: expect.arrayContaining([
        expect.objectContaining({
          id: "contact_2",
          displayName: "Grace Hopper",
          phone: "+15555550102"
        })
      ])
    });
  });

  it("returns null when the product contact detail is outside the tenant", async () => {
    await expect(getProductContactDetail("org_1", "missing")).resolves.toBeNull();
  });

  it("freezes contact metric metadata before rendering", () => {
    expect(Object.isFrozen(productContactMetricRows)).toBe(true);
    expect(productContactMetricRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productContactMetricRows.map((row) => row.key)).toEqual([
      "total",
      "optedIn",
      "optedOut",
      "unknown",
      "archived"
    ]);

    expect(() =>
      (productContactMetricRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productContactMetricRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productContactMetricRows[0].label).toBe("Active Contacts");
  });

  it("freezes contact detail status metadata before rendering", () => {
    expect(Object.isFrozen(productContactDetailStatusRows)).toBe(true);
    expect(productContactDetailStatusRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(productContactDetailStatusRows.map((row) => row.key)).toEqual([
      "phone",
      "consent",
      "lists",
      "tags",
      "archived"
    ]);

    expect(() =>
      (productContactDetailStatusRows as unknown as Array<{ key: string; label: string }>).push({
        key: "unsafe",
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productContactDetailStatusRows[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productContactDetailStatusRows[0].label).toBe("Phone");
  });

  it("freezes contact consent option metadata before rendering the detail workflow", () => {
    expect(Object.isFrozen(productContactConsentOptions)).toBe(true);
    expect(productContactConsentOptions.every((option) => Object.isFrozen(option))).toBe(true);
    expect(productContactConsentOptions.map((option) => option.value)).toEqual([
      ConsentStatus.UNKNOWN,
      ConsentStatus.OPTED_IN,
      ConsentStatus.OPTED_OUT
    ]);

    expect(() =>
      (productContactConsentOptions as unknown as Array<{ value: ConsentStatus; label: string }>).push({
        value: ConsentStatus.OPTED_IN,
        label: "Unsafe"
      })
    ).toThrow(TypeError);
    expect(() => {
      (productContactConsentOptions[0] as { label: string }).label = "Unsafe";
    }).toThrow(TypeError);
    expect(productContactConsentOptions[0].label).toBe("UNKNOWN");
  });

  it("freezes contact import defaults before rendering the local CSV import workflow", () => {
    expect(Object.isFrozen(productContactImportDefaults)).toBe(true);
    expect(productContactImportDefaults).toEqual({
      filename: "product-contacts.csv",
      csv: `phone,email,first_name,last_name,consent_status,opt_in_source,tags,lists
+15555550155,casey@example.com,Casey,Rivera,OPTED_IN,demo_form,webinar,Demo Leads`
    });

    expect(() => {
      (productContactImportDefaults as { filename: string }).filename = "unsafe.csv";
    }).toThrow(TypeError);
    expect(() => {
      (productContactImportDefaults as { csv: string }).csv = "phone";
    }).toThrow(TypeError);
    expect(productContactImportDefaults.filename).toBe("product-contacts.csv");
  });
});
