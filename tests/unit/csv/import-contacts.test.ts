import { ConsentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { parseContactImport } from "@/lib/csv/import-contacts";
import { parseCsv } from "@/lib/csv/parse";

describe("CSV contact import", () => {
  it("parses quoted cells and normalized headers", () => {
    expect(parseCsv('Phone,Full Name,Tags\n"+15555550100","Ada, Inc.","vip|trial"')).toEqual([
      {
        phone: "+15555550100",
        full_name: "Ada, Inc.",
        tags: "vip|trial"
      }
    ]);
  });

  it("maps CSV rows into contact create payloads", () => {
    const result = parseContactImport(
      "phone,email,first_name,consent_status,tags,lists\n+15555550100,ada@example.com,Ada,opted_in,vip|trial,Leads"
    );

    expect(result).toEqual({
      totalRows: 1,
      errors: [],
      contacts: [
        expect.objectContaining({
          phone: "+15555550100",
          email: "ada@example.com",
          firstName: "Ada",
          consentStatus: ConsentStatus.OPTED_IN,
          tagNames: ["vip", "trial"],
          listNames: ["Leads"]
        })
      ]
    });
  });

  it("returns row-scoped errors for invalid contacts", () => {
    const result = parseContactImport("phone,email\nshort,not-an-email");

    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ row: 2 })]);
  });
});
