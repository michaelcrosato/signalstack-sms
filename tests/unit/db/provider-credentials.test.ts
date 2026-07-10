import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
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

const mockPrismaClient = vi.hoisted(() => ({
  providerCredential: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  providerCredentialRotation: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  liveReadinessAuditEvent: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...mockPrismaClient,
    $transaction: vi.fn(async (cb) => cb(mockPrismaClient)),
  },
}));

describe("provider-credentials pure functions", () => {
  describe("redactValue", () => {
    it("redacts keeping last 4 by default", () => {
      expect(redactValue("AC1234567890abcdef1234")).toBe("redacted_1234");
    });
    it("redacts keeping specified visible chars", () => {
      expect(redactValue("AC1234567890abcdef1234", 2)).toBe("redacted_34");
    });
    it("handles short strings", () => {
      expect(redactValue("abc")).toBe("redacted_abc");
    });
    it("returns 'redacted' if value is empty", () => {
      expect(redactValue("   ")).toBe("redacted");
    });
  });

  describe("fingerprintSecret", () => {
    it("generates sha256 hash of the value", () => {
      const hash = fingerprintSecret("my-secret-token");
      expect(hash).toHaveLength(64);
      // sha256 of "my-secret-token" is ea5add57437cbf20af59034d7ed17968dcc56767b41965fcc5b376d45db8b4a3
      expect(hash).toBe("ea5add57437cbf20af59034d7ed17968dcc56767b41965fcc5b376d45db8b4a3");
    });
    it("trims whitespace before hashing", () => {
      expect(fingerprintSecret(" my-secret-token  ")).toBe("ea5add57437cbf20af59034d7ed17968dcc56767b41965fcc5b376d45db8b4a3");
    });
  });
});

describe("provider-credentials repository queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProviderCredential", () => {
    it("calls prisma.providerCredential.findUnique with correct args", async () => {
      const mockCred = { id: "cred1", provider: "twilio" };
      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValue(mockCred as ProviderCredential);

      const res = await getProviderCredential("org1", "twilio");

      expect(prisma.providerCredential.findUnique).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
      });
      expect(res).toEqual(mockCred);
    });
  });

  describe("getCredentialHistoryAction", () => {
    it("returns CONFIGURED if no previous credential", () => {
      const next = { accountSidLast4: "1234" } as ProviderCredential;
      expect(getCredentialHistoryAction(null, next)).toBe("CONFIGURED");
      expect(getCredentialHistoryAction(undefined, next)).toBe("CONFIGURED");
    });

    it("returns ROTATED if accountSidLast4 changed", () => {
      const prev = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      const next = { accountSidLast4: "1234", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("ROTATED");
    });

    it("returns ROTATED if authTokenFingerprint changed", () => {
      const prev = { accountSidLast4: "1111", authTokenFingerprint: "hash1", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      const next = { accountSidLast4: "1111", authTokenFingerprint: "hash2", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("ROTATED");
    });

    it("returns ROTATED if authTokenConfigured changed", () => {
      const prev = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: false, fromNumberLast4: "2222" } as ProviderCredential;
      const next = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("ROTATED");
    });

    it("returns ROTATED if fromNumberLast4 changed", () => {
      const prev = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      const next = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "3333" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("ROTATED");
    });

    it("returns REFRESHED if nothing sensitive changed", () => {
      const prev = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      const next = { accountSidLast4: "1111", authTokenFingerprint: "hash", authTokenConfigured: true, fromNumberLast4: "2222" } as ProviderCredential;
      expect(getCredentialHistoryAction(prev, next)).toBe("REFRESHED");
    });
  });

  describe("listProviderCredentialRotations", () => {
    it("calls prisma.providerCredentialRotation.findMany with correct args and maps result", async () => {
      const mockRotation = {
        id: "rot1",
        provider: "twilio",
        action: "CONFIGURED",
        providerCredentialId: "cred1",
        actorUserId: "user1",
        accountSidRedacted: "redacted_1234",
        accountSidLast4: "1234",
        fromNumberRedacted: "redacted_5678",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        previousAccountSidLast4: null,
        previousFromNumberLast4: null,
        previousAuthTokenConfigured: false,
        source: "local_metadata",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      };
      // @ts-expect-error - mocking partial prisma result
      vi.mocked(prisma.providerCredentialRotation.findMany).mockResolvedValue([mockRotation]);

      const res = await listProviderCredentialRotations("org1", "twilio", 10, "CONFIGURED");

      expect(prisma.providerCredentialRotation.findMany).toHaveBeenCalledWith({
        where: { orgId: "org1", provider: "twilio", action: "CONFIGURED" },
        orderBy: { createdAt: "desc" },
        take: 10
      });
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual(mockRotation);
    });

    it("omits action filter if not provided", async () => {
      vi.mocked(prisma.providerCredentialRotation.findMany).mockResolvedValue([]);
      await listProviderCredentialRotations("org1", "twilio");
      expect(prisma.providerCredentialRotation.findMany).toHaveBeenCalledWith({
        where: { orgId: "org1", provider: "twilio" },
        orderBy: { createdAt: "desc" },
        take: 20
      });
    });
  });
});

describe("provider-credentials metadata operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertProviderCredentialMetadata", () => {
    it("upserts credential, creates rotation log and readiness event", async () => {
      const input = {
        provider: "twilio",
        twilio: {
          accountSid: "AC1234567890abcdef1234",
          authToken: "my-secret-token",
          fromNumber: "+12345678901",
        }
      } as const;

      const mockPrevCred = {
        id: "cred1",
        accountSidLast4: "prev",
        fromNumberLast4: "prev",
        authTokenConfigured: false
      };
      const mockCred = {
        id: "cred1",
        provider: "twilio",
        accountSidRedacted: "redacted_1234",
        accountSidLast4: "1234",
        authTokenFingerprint: "hash",
        authTokenConfigured: true,
        fromNumberRedacted: "redacted_8901",
        fromNumberLast4: "8901",
        source: "local_metadata"
      };

      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValue(mockPrevCred as unknown as ProviderCredential);
      vi.mocked(prisma.providerCredential.upsert).mockResolvedValue(mockCred as unknown as ProviderCredential);

      const res = await upsertProviderCredentialMetadata("org1", input, { actorUserId: "user1" });

      expect(prisma.$transaction).toHaveBeenCalled();

      expect(prisma.providerCredential.upsert).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org1", provider: "twilio" } },
        update: expect.any(Object),
        create: expect.any(Object)
      });

      expect(prisma.providerCredentialRotation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org1",
          provider: "twilio",
          providerCredentialId: "cred1",
          action: "ROTATED",
          actorUserId: "user1",
        })
      });

      expect(prisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org1",
          actorUserId: "user1",
          action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
          subjectType: "ProviderCredential",
          subjectId: "cred1",
        })
      });

      expect(res).toEqual(mockCred);
    });
  });

  describe("deleteProviderCredentialMetadata", () => {
    it("deletes credential and creates audit logs if it exists", async () => {
      const mockCred = {
        id: "cred1",
        provider: "twilio",
        accountSidLast4: "1234",
        fromNumberLast4: "5678",
        authTokenConfigured: true,
        source: "local_metadata"
      };

      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValue(mockCred as unknown as ProviderCredential);

      const res = await deleteProviderCredentialMetadata("org1", "twilio", { actorUserId: "user1" });

      expect(prisma.$transaction).toHaveBeenCalled();

      expect(prisma.providerCredentialRotation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org1",
          provider: "twilio",
          providerCredentialId: "cred1",
          action: "DELETED",
          actorUserId: "user1",
          previousAccountSidLast4: "1234",
          previousFromNumberLast4: "5678",
          previousAuthTokenConfigured: true,
        })
      });

      expect(prisma.providerCredential.delete).toHaveBeenCalledWith({
        where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
      });

      expect(prisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: "org1",
          actorUserId: "user1",
          action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
          subjectType: "ProviderCredential",
          subjectId: "cred1",
          metadata: { provider: "twilio", existed: true }
        })
      });

      expect(res).toEqual({ deleted: true });
    });

    it("only creates readiness event if credential does not exist", async () => {
      vi.mocked(prisma.providerCredential.findUnique).mockResolvedValue(null);

      const res = await deleteProviderCredentialMetadata("org1", "twilio", { actorUserId: "user1" });

      expect(prisma.providerCredentialRotation.create).not.toHaveBeenCalled();
      expect(prisma.providerCredential.delete).not.toHaveBeenCalled();

      expect(prisma.liveReadinessAuditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
          metadata: { provider: "twilio", existed: false }
        })
      });

      expect(res).toEqual({ deleted: false });
    });
  });
});
