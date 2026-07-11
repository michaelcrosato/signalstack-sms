import { ConsentStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseContactImport } from "@/lib/csv/import-contacts";
import { parseCsv } from "@/lib/csv/parse";

describe("CSV contact import", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("parses quoted cells and normalized headers", () => {
    expect(parseCsv('Phone,Full Name,Tags\n"+15555550100","Ada, Inc.","vip|trial"')).toEqual([
      {
        phone: "+15555550100",
        full_name: "Ada, Inc.",
        tags: "vip|trial"
      }
    ]);
  });

  it("maps CSV rows into contact create payloads", async () => {
    const result = await parseContactImport(
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
 
  it("returns row-scoped errors for invalid contacts", async () => {
    const result = await parseContactImport("phone,email\nshort,not-an-email");
 
    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ row: 2 })]);
  });

  it("never performs paid live lookups during bulk import", async () => {
    vi.stubEnv("LIVE_LOOKUP_ENABLED", "true");
    vi.stubEnv("LIVE_LOOKUP_COST_ACK", "true");
    vi.stubEnv("LIVE_LOOKUP_OPERATOR_TOKEN", "lookup-operator-token-0123456789abcdef");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token123");
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await parseContactImport(
      "phone,first_name\n+15555550100,Ada\n+15555550101,Grace"
    );

    expect(result.contacts.map((contact) => contact.phone)).toEqual(["+15555550100", "+15555550101"]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
