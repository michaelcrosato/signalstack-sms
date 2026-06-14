import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProviderRotationsRoute } from "@/app/api/settings/provider/rotations/export/route";
import { GET as listProviderRotationsRoute } from "@/app/api/settings/provider/rotations/route";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn(),
  listProviderCredentialRotations: vi.fn(),
  serializeProviderCredentialRotationsCsv: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/db/repositories/provider-credentials", () => ({
  listProviderCredentialRotations: mocks.listProviderCredentialRotations
}));

vi.mock("@/lib/messaging/provider/credential-rotation-export", () => ({
  serializeProviderCredentialRotationsCsv: mocks.serializeProviderCredentialRotationsCsv
}));

describe("provider credential rotation API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "org_demo",
      userId: "user_demo",
      role: "OWNER",
      demoMode: true
    });
  });

  it("rejects unsupported list filters before reading local credential rotation history", async () => {
    const response = await listProviderRotationsRoute(
      new Request("http://localhost/api/settings/provider/rotations?action=UNSUPPORTED&limit=25")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid provider credential rotation query."
    });
    expect(mocks.listProviderCredentialRotations).not.toHaveBeenCalled();
    expect(mocks.serializeProviderCredentialRotationsCsv).not.toHaveBeenCalled();
  });

  it("lists local credential rotation history with bounded allowlisted filters", async () => {
    const rotations = [
      {
        id: "rotation_demo",
        provider: "twilio",
        action: "ROTATED",
        providerCredentialId: "credential_demo",
        actorUserId: "user_demo",
        accountSidRedacted: "redacted_1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "redacted_0199",
        fromNumberLast4: "0199",
        authTokenConfigured: true,
        previousAccountSidLast4: "0000",
        previousFromNumberLast4: "0100",
        previousAuthTokenConfigured: true,
        source: "local_metadata",
        createdAt: "2026-05-22T00:00:00.000Z"
      }
    ];
    mocks.listProviderCredentialRotations.mockResolvedValue(rotations);

    const response = await listProviderRotationsRoute(
      new Request("http://localhost/api/settings/provider/rotations?action=ROTATED&limit=25")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ rotations });
    expect(mocks.listProviderCredentialRotations).toHaveBeenCalledWith("org_demo", "twilio", 25, "ROTATED");
    expect(mocks.serializeProviderCredentialRotationsCsv).not.toHaveBeenCalled();
  });

  it("rejects unsupported export filters before reading or serializing rotation history", async () => {
    const response = await exportProviderRotationsRoute(
      new Request("http://localhost/api/settings/provider/rotations/export?action=EXFILTRATE&limit=25")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid provider credential rotation export query."
    });
    expect(mocks.listProviderCredentialRotations).not.toHaveBeenCalled();
    expect(mocks.serializeProviderCredentialRotationsCsv).not.toHaveBeenCalled();
  });

  it("exports local credential rotation history with bounded allowlisted filters", async () => {
    const rotations = [
      {
        id: "rotation_demo",
        provider: "twilio",
        action: "DELETED",
        providerCredentialId: "credential_demo",
        actorUserId: "user_demo",
        accountSidRedacted: null,
        accountSidLast4: null,
        fromNumberRedacted: null,
        fromNumberLast4: null,
        authTokenConfigured: false,
        previousAccountSidLast4: "1234",
        previousFromNumberLast4: "0199",
        previousAuthTokenConfigured: true,
        source: "local_metadata",
        createdAt: "2026-05-22T00:00:00.000Z"
      }
    ];
    mocks.listProviderCredentialRotations.mockResolvedValue(rotations);
    mocks.serializeProviderCredentialRotationsCsv.mockReturnValue("id,action\nrotation_demo,DELETED\n");

    const response = await exportProviderRotationsRoute(
      new Request("http://localhost/api/settings/provider/rotations/export?action=DELETED&limit=25")
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("id,action\nrotation_demo,DELETED\n");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(mocks.listProviderCredentialRotations).toHaveBeenCalledWith("org_demo", "twilio", 25, "DELETED");
    expect(mocks.serializeProviderCredentialRotationsCsv).toHaveBeenCalledWith(rotations);
  });
});
