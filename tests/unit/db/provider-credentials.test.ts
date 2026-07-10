import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  redactValue,
  fingerprintSecret,
  getProviderCredential,
  getCredentialHistoryAction,
  listProviderCredentialRotations,
  upsertProviderCredentialMetadata,
  deleteProviderCredentialMetadata
} from "@/lib/db/repositories/provider-credentials";
import { prisma } from "@/lib/db/prisma";
import type { ProviderCredential } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerCredential: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn()
    },
    providerCredentialRotation: {
      findMany: vi.fn(),
      create: vi.fn()
    },
    liveReadinessAuditEvent: {
      create: vi.fn()
    },
    $transaction: vi.fn((callback) => callback(prisma))
  }
}));

describe("Provider Credentials Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("redactValue", () => {
    it("redacts a normal string with default visible length", () => {
      expect(redactValue("1234567890")).toBe("redacted_7890");
    });
    it("handles short strings", () => {
      expect(redactValue("12")).toBe("redacted_12");
    });
    it("handles custom visible length", () => {
      expect(redactValue("1234567890", 2)).toBe("redacted_90");
    });
    it("handles empty or whitespace strings", () => {
      expect(redactValue("   ")).toBe("redacted");
    });
  });

  describe("fingerprintSecret", () => {
    it("creates a sha256 hash", () => {
      const hash = fingerprintSecret("test-secret");
      expect(hash).toHaveLength(64); // hex sha256
    });
    it("trims the value before hashing", () => {
      expect(fingerprintSecret(" test-secret ")).toBe(fingerprintSecret("test-secret"));
    });
  });

  describe("getCredentialHistoryAction", () => {
    it("returns CONFIGURED when previous is null", () => {
      expect(getCredentialHistoryAction(null, {} as ProviderCredential)).toBe("CONFIGURED");
    });

    it("returns ROTATED when properties change", () => {
      const prev = { accountSidLast4: "1234", authTokenFingerprint: "hash1", authTokenConfigured: true, fromNumberLast4: "5678" } as ProviderCredential;
      const next = { accountSidLast4: "4321", authTokenFingerprint: "hash1", authTokenConfigured: true, fromNumberLast4: "5678" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("ROTATED");
    });

    it("returns REFRESHED when properties match", () => {
      const prev = { accountSidLast4: "1234", authTokenFingerprint: "hash1", authTokenConfigured: true, fromNumberLast4: "5678" } as ProviderCredential;
      const next = { accountSidLast4: "1234", authTokenFingerprint: "hash1", authTokenConfigured: true, fromNumberLast4: "5678" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("REFRESHED");
    });
  });

  describe("getProviderCredential", () => {
    it("calls prisma.findUnique correctly", async () => {
      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValueOnce({ id: "cred-1" } as ProviderCredential);
      const res = await getProviderCredential("org1", "twilio");
      expect(res).toEqual({ id: "cred-1" });
      expect(prisma.providerCredential.findUnique).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
      });
    });
  });

  describe("listProviderCredentialRotations", () => {
    it("calls findMany and maps correctly", async () => {
      const mockRotation = {
        id: "rot-1",
        provider: "twilio",
        action: "CONFIGURED",
        providerCredentialId: "cred-1",
        actorUserId: "user-1",
        accountSidRedacted: "redacted_1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "redacted_5678",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        previousAccountSidLast4: null,
        previousFromNumberLast4: null,
        previousAuthTokenConfigured: false,
        source: "local_metadata",
        createdAt: new Date("2023-01-01")
      };
      vi.mocked(prisma.providerCredentialRotation.findMany).mockResolvedValueOnce([mockRotation as unknown as Awaited<ReturnType<typeof prisma.providerCredentialRotation.findMany>>[0]]);

      const res = await listProviderCredentialRotations("org1", "twilio", 5, "ROTATED");
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual(mockRotation);
      expect(prisma.providerCredentialRotation.findMany).toHaveBeenCalledWith({
        where: { orgId: "org1", provider: "twilio", action: "ROTATED" },
        orderBy: { createdAt: "desc" },
        take: 5
      });
    });
  });

  describe("upsertProviderCredentialMetadata", () => {
    it("upserts credential, creates rotation, and live readiness audit event in a transaction", async () => {
      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValueOnce(null);
      const mockCred = {
        id: "cred-1",
        provider: "twilio",
        accountSidRedacted: "redacted_1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "redacted_5678",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        source: "local_metadata"
      } as ProviderCredential;
      vi.mocked(prisma.providerCredential.upsert).mockResolvedValueOnce(mockCred);

      const input = {
        provider: "twilio",
        twilio: {
          accountSid: "AC12345678901234",
          authToken: "secret123",
          fromNumber: "+1234567890"
        }
      } as Parameters<typeof upsertProviderCredentialMetadata>[1];

      const res = await upsertProviderCredentialMetadata("org1", input, { actorUserId: "user-1" });

      expect(res).toEqual(mockCred);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.providerCredential.upsert).toHaveBeenCalled();
      expect(prisma.providerCredentialRotation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org1",
          provider: "twilio",
          providerCredentialId: "cred-1",
          action: "CONFIGURED",
          actorUserId: "user-1"
        })
      }));
      expect(prisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org1",
          actorUserId: "user-1",
          action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED"
        })
      }));
    });
  });

  describe("deleteProviderCredentialMetadata", () => {
    it("deletes credential, creates rotation, and audit event if credential exists", async () => {
      const mockCred = {
        id: "cred-1",
        provider: "twilio",
        accountSidLast4: "1234",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        source: "local_metadata"
      } as ProviderCredential;
      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValueOnce(mockCred);

      const res = await deleteProviderCredentialMetadata("org1", "twilio", { actorUserId: "user-1" });

      expect(res).toEqual({ deleted: true });
      expect(prisma.providerCredentialRotation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETED",
          providerCredentialId: "cred-1",
          actorUserId: "user-1"
        })
      }));
      expect(prisma.providerCredential.delete).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
      });
      expect(prisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
          metadata: { provider: "twilio", existed: true }
        })
      }));
    });

    it("only creates audit event if credential does not exist", async () => {
      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValueOnce(null);

      const res = await deleteProviderCredentialMetadata("org1", "twilio", { actorUserId: "user-1" });

      expect(res).toEqual({ deleted: false });
      expect(prisma.providerCredentialRotation.create).not.toHaveBeenCalled();
      expect(prisma.providerCredential.delete).not.toHaveBeenCalled();
      expect(prisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
          metadata: { provider: "twilio", existed: false }
        })
      }));
    });
  });
});
