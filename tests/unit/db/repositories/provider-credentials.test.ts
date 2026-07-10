import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  redactValue,
  fingerprintSecret,
  getProviderCredential,
  getCredentialHistoryAction,
  listProviderCredentialRotations,
  upsertProviderCredentialMetadata,
  deleteProviderCredentialMetadata
} from "@/lib/db/repositories/provider-credentials";
import type { ProviderCredential } from "@prisma/client";
import type { ProviderSettingsUpdateInput } from "@/lib/validation/provider";

const mocks = vi.hoisted(() => ({
  providerCredentialFindUnique: vi.fn(),
  providerCredentialUpsert: vi.fn(),
  providerCredentialDelete: vi.fn(),
  providerCredentialRotationFindMany: vi.fn(),
  providerCredentialRotationCreate: vi.fn(),
  liveReadinessAuditEventCreate: vi.fn(),
  transaction: vi.fn(async (cb) => {
    return cb({
      providerCredential: {
        findUnique: mocks.providerCredentialFindUnique,
        upsert: mocks.providerCredentialUpsert,
        delete: mocks.providerCredentialDelete
      },
      providerCredentialRotation: {
        create: mocks.providerCredentialRotationCreate
      },
      liveReadinessAuditEvent: {
        create: mocks.liveReadinessAuditEventCreate
      }
    });
  })
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerCredential: {
      findUnique: mocks.providerCredentialFindUnique
    },
    providerCredentialRotation: {
      findMany: mocks.providerCredentialRotationFindMany
    },
    $transaction: mocks.transaction
  }
}));

describe("provider-credentials repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("redactValue", () => {
    it("redacts a value with the default 4 visible characters", () => {
      expect(redactValue("1234567890")).toBe("redacted_7890");
    });

    it("redacts a value with a custom visible characters count", () => {
      expect(redactValue("1234567890", 2)).toBe("redacted_90");
    });

    it("trims the value before redacting", () => {
      expect(redactValue("  1234567890  ")).toBe("redacted_7890");
    });

    it("returns 'redacted' if value is empty", () => {
      expect(redactValue("")).toBe("redacted");
    });

    it("returns 'redacted' and the original string when visible is 0", () => {
      // .slice(0) returns the whole string, or slice(-0) returns the whole string
      expect(redactValue("123456", 0)).toBe("redacted_123456");
    });
  });

  describe("fingerprintSecret", () => {
    it("returns a sha256 hex digest of the trimmed value", () => {
      // sha256("test") = 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
      expect(fingerprintSecret("test")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
      expect(fingerprintSecret("  test  ")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
    });
  });

  describe("getCredentialHistoryAction", () => {
    const defaultCredential = {
      accountSidLast4: "1234",
      authTokenFingerprint: "fingerprint",
      authTokenConfigured: true,
      fromNumberLast4: "5678"
    } as ProviderCredential;

    it("returns CONFIGURED if previous is null or undefined", () => {
      expect(getCredentialHistoryAction(null, defaultCredential)).toBe("CONFIGURED");
      expect(getCredentialHistoryAction(undefined, defaultCredential)).toBe("CONFIGURED");
    });

    it("returns REFRESHED if nothing changed", () => {
      expect(getCredentialHistoryAction(defaultCredential, { ...defaultCredential })).toBe("REFRESHED");
    });

    it("returns ROTATED if accountSidLast4 changed", () => {
      expect(getCredentialHistoryAction(defaultCredential, { ...defaultCredential, accountSidLast4: "9999" })).toBe("ROTATED");
    });

    it("returns ROTATED if authTokenFingerprint changed", () => {
      expect(getCredentialHistoryAction(defaultCredential, { ...defaultCredential, authTokenFingerprint: "new-fingerprint" })).toBe("ROTATED");
    });

    it("returns ROTATED if authTokenConfigured changed", () => {
      expect(getCredentialHistoryAction(defaultCredential, { ...defaultCredential, authTokenConfigured: false })).toBe("ROTATED");
    });

    it("returns ROTATED if fromNumberLast4 changed", () => {
      expect(getCredentialHistoryAction(defaultCredential, { ...defaultCredential, fromNumberLast4: "0000" })).toBe("ROTATED");
    });
  });

  describe("getProviderCredential", () => {
    it("calls prisma.providerCredential.findUnique with correct args", async () => {
      const mockCredential = { id: "cred-1" };
      mocks.providerCredentialFindUnique.mockResolvedValueOnce(mockCredential);

      const result = await getProviderCredential("org-1", "twilio");

      expect(mocks.providerCredentialFindUnique).toHaveBeenCalledWith({
        where: {
          orgId_provider: {
            orgId: "org-1",
            provider: "twilio"
          }
        }
      });
      expect(result).toBe(mockCredential);
    });
  });

  describe("listProviderCredentialRotations", () => {
    it("calls prisma.providerCredentialRotation.findMany with correct args and maps result", async () => {
      const mockRotations = [
        {
          id: "rot-1",
          provider: "twilio",
          action: "ROTATED",
          providerCredentialId: "cred-1",
          actorUserId: "user-1",
          accountSidRedacted: "redacted_1234",
          accountSidLast4: "1234",
          fromNumberRedacted: "redacted_5678",
          fromNumberLast4: "5678",
          authTokenConfigured: true,
          previousAccountSidLast4: "0000",
          previousFromNumberLast4: "9999",
          previousAuthTokenConfigured: false,
          source: "local_metadata",
          createdAt: new Date("2024-01-01T00:00:00Z")
        }
      ];
      mocks.providerCredentialRotationFindMany.mockResolvedValueOnce(mockRotations);

      const result = await listProviderCredentialRotations("org-1", "twilio", 10, "ROTATED");

      expect(mocks.providerCredentialRotationFindMany).toHaveBeenCalledWith({
        where: { orgId: "org-1", provider: "twilio", action: "ROTATED" },
        orderBy: { createdAt: "desc" },
        take: 10
      });
      expect(result).toEqual(mockRotations);
    });
  });

  describe("upsertProviderCredentialMetadata", () => {
    it("upserts credential and creates audit events when previous credential does not exist", async () => {
      mocks.providerCredentialFindUnique.mockResolvedValueOnce(null);
      const newCredential = {
        id: "cred-1",
        provider: "twilio",
        accountSidRedacted: "redacted_1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "redacted_5678",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        source: "local_metadata"
      };
      mocks.providerCredentialUpsert.mockResolvedValueOnce(newCredential);

      const input = {
        provider: "twilio",
        twilio: {
          accountSid: "AC1234",
          authToken: "secret",
          fromNumber: "+12345678"
        }
      };

      const result = await upsertProviderCredentialMetadata("org-1", input as ProviderSettingsUpdateInput, { actorUserId: "user-1" });

      expect(mocks.providerCredentialFindUnique).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org-1", provider: "twilio" } }
      });
      expect(mocks.providerCredentialUpsert).toHaveBeenCalled();
      expect(mocks.providerCredentialRotationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "CONFIGURED",
          orgId: "org-1",
          provider: "twilio",
          providerCredentialId: "cred-1",
          actorUserId: "user-1"
        })
      });
      expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
          subjectId: "cred-1",
          orgId: "org-1"
        })
      });
      expect(result).toBe(newCredential);
    });
  });

  describe("deleteProviderCredentialMetadata", () => {
    it("does nothing if credential does not exist, except audit event", async () => {
      mocks.providerCredentialFindUnique.mockResolvedValueOnce(null);

      const result = await deleteProviderCredentialMetadata("org-1", "twilio", { actorUserId: "user-1" });

      expect(mocks.providerCredentialRotationCreate).not.toHaveBeenCalled();
      expect(mocks.providerCredentialDelete).not.toHaveBeenCalled();
      expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
          orgId: "org-1",
          metadata: { provider: "twilio", existed: false }
        })
      });
      expect(result).toEqual({ deleted: false });
    });

    it("deletes credential and creates audit events if credential exists", async () => {
      const existingCredential = {
        id: "cred-1",
        provider: "twilio",
        accountSidLast4: "1234",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        source: "local_metadata"
      };
      mocks.providerCredentialFindUnique.mockResolvedValueOnce(existingCredential);

      const result = await deleteProviderCredentialMetadata("org-1", "twilio", { actorUserId: "user-1" });

      expect(mocks.providerCredentialRotationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "DELETED",
          providerCredentialId: "cred-1",
          actorUserId: "user-1"
        })
      });
      expect(mocks.providerCredentialDelete).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org-1", provider: "twilio" } }
      });
      expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
          orgId: "org-1",
          metadata: { provider: "twilio", existed: true }
        })
      });
      expect(result).toEqual({ deleted: true });
    });
  });
});
