import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  redactValue,
  fingerprintSecret,
  getCredentialHistoryAction,
  getProviderCredential,
  listProviderCredentialRotations,
  upsertProviderCredentialMetadata,
  deleteProviderCredentialMetadata
} from "@/lib/db/repositories/provider-credentials";

const mocks = vi.hoisted(() => ({
  providerCredentialFindUnique: vi.fn(),
  providerCredentialRotationFindMany: vi.fn(),
  providerCredentialUpsert: vi.fn(),
  providerCredentialDelete: vi.fn(),
  providerCredentialRotationCreate: vi.fn(),
  liveReadinessAuditEventCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerCredential: {
      findUnique: mocks.providerCredentialFindUnique,
      upsert: mocks.providerCredentialUpsert,
      delete: mocks.providerCredentialDelete
    },
    providerCredentialRotation: {
      findMany: mocks.providerCredentialRotationFindMany,
      create: mocks.providerCredentialRotationCreate
    },
    liveReadinessAuditEvent: {
      create: mocks.liveReadinessAuditEventCreate
    },
    $transaction: mocks.transaction
  }
}));

describe("redactValue", () => {
  it("redacts values with default visible characters", () => {
    expect(redactValue("1234567890")).toBe("redacted_7890");
  });

  it("redacts values with custom visible characters", () => {
    expect(redactValue("1234567890", 2)).toBe("redacted_90");
  });

  it("handles short values", () => {
    expect(redactValue("123")).toBe("redacted_123");
  });

  it("trims whitespace before redacting", () => {
    expect(redactValue("  1234567890  ")).toBe("redacted_7890");
  });

  it("returns 'redacted' if suffix is empty", () => {
    expect(redactValue("   ")).toBe("redacted");
  });
});

describe("fingerprintSecret", () => {
  it("hashes a value using sha256 and returns hex string", () => {
    const hash = fingerprintSecret("mysecret");
    expect(hash).toHaveLength(64); // sha256 hex is 64 chars
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("trims whitespace before hashing", () => {
    const hash1 = fingerprintSecret("mysecret");
    const hash2 = fingerprintSecret("  mysecret  ");
    expect(hash1).toBe(hash2);
  });
});

describe("getCredentialHistoryAction", () => {
  const dummyCredential = {
    id: "cred1",
    orgId: "org1",
    provider: "twilio",
    accountSidRedacted: "redacted_1234",
    accountSidLast4: "1234",
    authTokenFingerprint: "hash",
    authTokenConfigured: true,
    fromNumberRedacted: "redacted_5678",
    fromNumberLast4: "5678",
    source: "local_metadata" as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("returns 'CONFIGURED' if there is no previous credential", () => {
    expect(getCredentialHistoryAction(null, dummyCredential)).toBe("CONFIGURED");
    expect(getCredentialHistoryAction(undefined, dummyCredential)).toBe("CONFIGURED");
  });

  it("returns 'ROTATED' if accountSidLast4 changed", () => {
    expect(getCredentialHistoryAction(dummyCredential, { ...dummyCredential, accountSidLast4: "9999" })).toBe(
      "ROTATED"
    );
  });

  it("returns 'ROTATED' if authTokenFingerprint changed", () => {
    expect(getCredentialHistoryAction(dummyCredential, { ...dummyCredential, authTokenFingerprint: "newhash" })).toBe(
      "ROTATED"
    );
  });

  it("returns 'ROTATED' if authTokenConfigured changed", () => {
    expect(getCredentialHistoryAction(dummyCredential, { ...dummyCredential, authTokenConfigured: false })).toBe(
      "ROTATED"
    );
  });

  it("returns 'ROTATED' if fromNumberLast4 changed", () => {
    expect(getCredentialHistoryAction(dummyCredential, { ...dummyCredential, fromNumberLast4: "9999" })).toBe(
      "ROTATED"
    );
  });

  it("returns 'REFRESHED' if nothing sensitive changed", () => {
    // Only updated at or something else not tracked by getCredentialHistoryAction changed
    expect(
      getCredentialHistoryAction(dummyCredential, { ...dummyCredential, updatedAt: new Date(Date.now() + 1000) })
    ).toBe("REFRESHED");
  });
});

describe("getProviderCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls prisma.providerCredential.findUnique with correct args", async () => {
    mocks.providerCredentialFindUnique.mockResolvedValue({ id: "cred1" });

    const result = await getProviderCredential("org1", "twilio");

    expect(result).toEqual({ id: "cred1" });
    expect(mocks.providerCredentialFindUnique).toHaveBeenCalledWith({
      where: {
        orgId_provider: {
          orgId: "org1",
          provider: "twilio"
        }
      }
    });
  });
});

describe("listProviderCredentialRotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls prisma.providerCredentialRotation.findMany with default take and no action", async () => {
    mocks.providerCredentialRotationFindMany.mockResolvedValue([
      { id: "rot1", provider: "twilio", action: "CONFIGURED" }
    ]);

    const result = await listProviderCredentialRotations("org1", "twilio");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("rot1");
    expect(mocks.providerCredentialRotationFindMany).toHaveBeenCalledWith({
      where: { orgId: "org1", provider: "twilio" },
      orderBy: { createdAt: "desc" },
      take: 20
    });
  });

  it("calls prisma.providerCredentialRotation.findMany with custom take and action", async () => {
    mocks.providerCredentialRotationFindMany.mockResolvedValue([]);

    await listProviderCredentialRotations("org1", "twilio", 10, "ROTATED");

    expect(mocks.providerCredentialRotationFindMany).toHaveBeenCalledWith({
      where: { orgId: "org1", provider: "twilio", action: "ROTATED" },
      orderBy: { createdAt: "desc" },
      take: 10
    });
  });
});

describe("upsertProviderCredentialMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.transaction.mockImplementation(async (callback) => {
      return callback({
        providerCredential: {
          findUnique: mocks.providerCredentialFindUnique,
          upsert: mocks.providerCredentialUpsert
        },
        providerCredentialRotation: {
          create: mocks.providerCredentialRotationCreate
        },
        liveReadinessAuditEvent: {
          create: mocks.liveReadinessAuditEventCreate
        }
      });
    });
  });

  it("upserts credential and creates rotation and audit events", async () => {
    const input = {
      provider: "twilio" as const,
      twilio: {
        accountSid: "AC1234567890",
        authToken: "mysecret",
        fromNumber: "+1234567890"
      }
    };

    mocks.providerCredentialFindUnique.mockResolvedValue(null);
    mocks.providerCredentialUpsert.mockResolvedValue({
      id: "cred1",
      provider: "twilio",
      accountSidRedacted: "redacted_7890",
      accountSidLast4: "7890",
      authTokenConfigured: true,
      fromNumberRedacted: "redacted_7890",
      fromNumberLast4: "7890",
      source: "local_metadata"
    });

    const result = await upsertProviderCredentialMetadata("org1", input, { actorUserId: "user1" });

    expect(result.id).toBe("cred1");

    // Check findUnique
    expect(mocks.providerCredentialFindUnique).toHaveBeenCalledWith({
      where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
    });

    // Check upsert
    expect(mocks.providerCredentialUpsert).toHaveBeenCalled();
    const upsertArgs = mocks.providerCredentialUpsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ orgId_provider: { orgId: "org1", provider: "twilio" } });
    expect(upsertArgs.update.accountSidLast4).toBe("7890");
    expect(upsertArgs.create.accountSidLast4).toBe("7890");

    // Check rotation creation
    expect(mocks.providerCredentialRotationCreate).toHaveBeenCalled();
    const rotationArgs = mocks.providerCredentialRotationCreate.mock.calls[0][0];
    expect(rotationArgs.data.action).toBe("CONFIGURED");
    expect(rotationArgs.data.actorUserId).toBe("user1");

    // Check audit event creation
    expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalled();
    const auditArgs = mocks.liveReadinessAuditEventCreate.mock.calls[0][0];
    expect(auditArgs.data.action).toBe("PROVIDER_CREDENTIAL_METADATA_UPSERTED");
    expect(auditArgs.data.actorUserId).toBe("user1");
  });
});

describe("deleteProviderCredentialMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.transaction.mockImplementation(async (callback) => {
      return callback({
        providerCredential: {
          findUnique: mocks.providerCredentialFindUnique,
          delete: mocks.providerCredentialDelete
        },
        providerCredentialRotation: {
          create: mocks.providerCredentialRotationCreate
        },
        liveReadinessAuditEvent: {
          create: mocks.liveReadinessAuditEventCreate
        }
      });
    });
  });

  it("deletes credential and creates rotation and audit events if exists", async () => {
    mocks.providerCredentialFindUnique.mockResolvedValue({
      id: "cred1",
      provider: "twilio",
      accountSidLast4: "7890",
      fromNumberLast4: "7890",
      authTokenConfigured: true,
      source: "local_metadata"
    });

    const result = await deleteProviderCredentialMetadata("org1", "twilio", { actorUserId: "user1" });

    expect(result).toEqual({ deleted: true });

    // Check findUnique
    expect(mocks.providerCredentialFindUnique).toHaveBeenCalledWith({
      where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
    });

    // Check rotation creation
    expect(mocks.providerCredentialRotationCreate).toHaveBeenCalled();
    const rotationArgs = mocks.providerCredentialRotationCreate.mock.calls[0][0];
    expect(rotationArgs.data.action).toBe("DELETED");
    expect(rotationArgs.data.previousAccountSidLast4).toBe("7890");

    // Check delete
    expect(mocks.providerCredentialDelete).toHaveBeenCalledWith({
      where: { orgId_provider: { orgId: "org1", provider: "twilio" } }
    });

    // Check audit event creation
    expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalled();
    const auditArgs = mocks.liveReadinessAuditEventCreate.mock.calls[0][0];
    expect(auditArgs.data.action).toBe("PROVIDER_CREDENTIAL_METADATA_DELETED");
    expect(auditArgs.data.metadata.existed).toBe(true);
  });

  it("only creates audit event if credential doesn't exist", async () => {
    mocks.providerCredentialFindUnique.mockResolvedValue(null);

    const result = await deleteProviderCredentialMetadata("org1", "twilio");

    expect(result).toEqual({ deleted: false });

    expect(mocks.providerCredentialFindUnique).toHaveBeenCalled();
    expect(mocks.providerCredentialRotationCreate).not.toHaveBeenCalled();
    expect(mocks.providerCredentialDelete).not.toHaveBeenCalled();

    expect(mocks.liveReadinessAuditEventCreate).toHaveBeenCalled();
    const auditArgs = mocks.liveReadinessAuditEventCreate.mock.calls[0][0];
    expect(auditArgs.data.metadata.existed).toBe(false);
  });
});
