import { describe, expect, it } from "vitest";
import { serializeProviderCredentialRotationsCsv, ProviderCredentialRotationExportRow } from "@/lib/messaging/provider/credential-rotation-export";

describe("serializeProviderCredentialRotationsCsv", () => {
  it("serializes an empty array", () => {
    const rotations: ProviderCredentialRotationExportRow[] = [];
    const csv = serializeProviderCredentialRotationsCsv(rotations);
    expect(csv).toBe(
      "id,provider,action,providerCredentialId,actorUserId,accountSidRedacted,accountSidLast4,fromNumberRedacted,fromNumberLast4,authTokenConfigured,previousAccountSidLast4,previousFromNumberLast4,previousAuthTokenConfigured,source,createdAt"
    );
  });

  it("serializes a valid row correctly", () => {
    const rotations: ProviderCredentialRotationExportRow[] = [
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
        createdAt: new Date("2024-01-01T12:00:00Z")
      }
    ];

    const csv = serializeProviderCredentialRotationsCsv(rotations);

    const expectedHeader = "id,provider,action,providerCredentialId,actorUserId,accountSidRedacted,accountSidLast4,fromNumberRedacted,fromNumberLast4,authTokenConfigured,previousAccountSidLast4,previousFromNumberLast4,previousAuthTokenConfigured,source,createdAt";
    const expectedRow = "\"rot_1\",\"twilio\",\"create\",\"cred_1\",\"user_1\",\"AC***1234\",\"1234\",\"+1***5678\",\"5678\",\"true\",\"\",\"\",\"false\",\"api\",\"2024-01-01T12:00:00.000Z\"";

    expect(csv).toBe(`${expectedHeader}\n${expectedRow}`);
  });

  it("escapes double quotes in values", () => {
    const rotations: ProviderCredentialRotationExportRow[] = [
      {
        id: 'rot_2',
        provider: 'twil"io',
        action: "update",
        providerCredentialId: "cred_2",
        actorUserId: "user_2",
        accountSidRedacted: "AC***1234",
        accountSidLast4: "1234",
        fromNumberRedacted: null,
        fromNumberLast4: null,
        authTokenConfigured: true,
        previousAccountSidLast4: "0000",
        previousFromNumberLast4: null,
        previousAuthTokenConfigured: true,
        source: "dashboard",
        createdAt: new Date("2024-01-02T12:00:00Z")
      }
    ];

    const csv = serializeProviderCredentialRotationsCsv(rotations);
    const row = csv.split('\n')[1];

    expect(row).toContain('"twil""io"');
  });
});
