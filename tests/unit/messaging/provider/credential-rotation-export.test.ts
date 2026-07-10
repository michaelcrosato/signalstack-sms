import { describe, expect, it } from "vitest";
import { serializeProviderCredentialRotationsCsv, type ProviderCredentialRotationExportRow } from "@/lib/messaging/provider/credential-rotation-export";

describe("serializeProviderCredentialRotationsCsv", () => {
  const expectedHeader = "id,provider,action,providerCredentialId,actorUserId,accountSidRedacted,accountSidLast4,fromNumberRedacted,fromNumberLast4,authTokenConfigured,previousAccountSidLast4,previousFromNumberLast4,previousAuthTokenConfigured,source,createdAt";

  it("serializes an empty array", () => {
    const csv = serializeProviderCredentialRotationsCsv([]);
    expect(csv).toBe(expectedHeader);
  });

  it("serializes a valid row correctly", () => {
    const row: ProviderCredentialRotationExportRow = {
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
      createdAt: new Date("2024-01-01T12:00:00.000Z")
    };

    const csv = serializeProviderCredentialRotationsCsv([row]);
    const expectedRow = "rot_1,twilio,create,cred_1,user_1,AC***1234,1234,'+1***5678,5678,true,,,false,api,2024-01-01T12:00:00.000Z";

    expect(csv).toBe(`${expectedHeader}\n${expectedRow}`);
  });

  it("escapes double quotes in values", () => {
    const row: ProviderCredentialRotationExportRow = {
      id: 'rot_1"2',
      provider: "twilio",
      action: "create",
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
      source: "api",
      createdAt: new Date("2024-01-01T12:00:00.000Z")
    };

    const csv = serializeProviderCredentialRotationsCsv([row]);
    const expectedRow = "\"rot_1\"\"2\",twilio,create,,,,,,,false,,,false,api,2024-01-01T12:00:00.000Z";
    expect(csv).toBe(`${expectedHeader}\n${expectedRow}`);
  });
});
