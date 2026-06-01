import { describe, expect, it } from "vitest";
import { serializeProviderCredentialRotationsCsv, ProviderCredentialRotationExportRow } from "@/lib/messaging/provider/credential-rotation-export";

describe("serializeProviderCredentialRotationsCsv", () => {
  it("serializes an empty array to just the CSV headers", () => {
    const csv = serializeProviderCredentialRotationsCsv([]);
    expect(csv).toBe("id,provider,action,providerCredentialId,actorUserId,accountSidRedacted,accountSidLast4,fromNumberRedacted,fromNumberLast4,authTokenConfigured,previousAccountSidLast4,previousFromNumberLast4,previousAuthTokenConfigured,source,createdAt");
  });

  it("serializes rows with primitive types, nulls, and booleans", () => {
    const rows: ProviderCredentialRotationExportRow[] = [
      {
        id: "rot_1",
        provider: "twilio",
        action: "create",
        providerCredentialId: "cred_1",
        actorUserId: "user_1",
        accountSidRedacted: "AC***1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "+1***5678",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        previousAccountSidLast4: null,
        previousFromNumberLast4: null,
        previousAuthTokenConfigured: false,
        source: "api",
        createdAt: new Date("2023-01-01T00:00:00Z"),
      }
    ];

    const csv = serializeProviderCredentialRotationsCsv(rows);
    const lines = csv.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe('"rot_1","twilio","create","cred_1","user_1","AC***1234","1234","+1***5678","5678","true","","","false","api","2023-01-01T00:00:00.000Z"');
  });

  it("escapes quotes correctly", () => {
    const rows: ProviderCredentialRotationExportRow[] = [
      {
        id: "rot_2",
        provider: "twilio",
        action: 'action "with" quotes',
        providerCredentialId: null,
        actorUserId: null,
        accountSidRedacted: null,
        accountSidLast4: null,
        fromNumberRedacted: null,
        fromNumberLast4: null,
        authTokenConfigured: false,
        previousAccountSidLast4: null,
        previousFromNumberLast4: null,
        previousAuthTokenConfigured: false,
        source: 'source "with" quotes',
        createdAt: new Date("2023-01-02T00:00:00Z"),
      }
    ];

    const csv = serializeProviderCredentialRotationsCsv(rows);
    const lines = csv.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe('"rot_2","twilio","action ""with"" quotes","","","","","","","false","","","false","source ""with"" quotes","2023-01-02T00:00:00.000Z"');
  });

  it("handles multiple rows", () => {
    const rows: ProviderCredentialRotationExportRow[] = [
      {
        id: "rot_1",
        provider: "twilio",
        action: "create",
        providerCredentialId: "cred_1",
        actorUserId: "user_1",
        accountSidRedacted: "AC***1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "+1***5678",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        previousAccountSidLast4: null,
        previousFromNumberLast4: null,
        previousAuthTokenConfigured: false,
        source: "api",
        createdAt: new Date("2023-01-01T00:00:00Z"),
      },
      {
        id: "rot_2",
        provider: "twilio",
        action: "update",
        providerCredentialId: "cred_1",
        actorUserId: "user_2",
        accountSidRedacted: "AC***4321",
        accountSidLast4: "4321",
        fromNumberRedacted: "+1***8765",
        fromNumberLast4: "8765",
        authTokenConfigured: false,
        previousAccountSidLast4: "1234",
        previousFromNumberLast4: "5678",
        previousAuthTokenConfigured: true,
        source: "dashboard",
        createdAt: new Date("2023-01-02T00:00:00Z"),
      }
    ];

    const csv = serializeProviderCredentialRotationsCsv(rows);
    const lines = csv.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[1]).toBe('"rot_1","twilio","create","cred_1","user_1","AC***1234","1234","+1***5678","5678","true","","","false","api","2023-01-01T00:00:00.000Z"');
    expect(lines[2]).toBe('"rot_2","twilio","update","cred_1","user_2","AC***4321","4321","+1***8765","8765","false","1234","5678","true","dashboard","2023-01-02T00:00:00.000Z"');
  });
});
