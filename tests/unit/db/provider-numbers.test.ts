import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderPhoneNumberStatus } from "@prisma/client";
import { listProviderPhoneNumbers, upsertProviderPhoneNumber } from "@/lib/db/repositories/provider-numbers";

const hoistedMocks = vi.hoisted(() => {
  const tx = {
    providerPhoneNumber: {
      updateMany: vi.fn(),
      upsert: vi.fn()
    },
    liveReadinessAuditEvent: {
      create: vi.fn()
    }
  };
  return {
    findMany: vi.fn(),
    tx,
    transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx))
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerPhoneNumber: {
      findMany: hoistedMocks.findMany
    },
    $transaction: hoistedMocks.transaction
  }
}));

describe("listProviderPhoneNumbers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the list of provider phone numbers ordered by default and created date", async () => {
    const mockNumbers = [{ id: "1", phoneNumber: "+1234567890", isDefault: true }];
    hoistedMocks.findMany.mockResolvedValue(mockNumbers);

    const result = await listProviderPhoneNumbers("org_demo");

    expect(hoistedMocks.findMany).toHaveBeenCalledWith({
      where: { orgId: "org_demo" },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
    expect(result).toEqual(mockNumbers);
  });
});

describe("upsertProviderPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle default phone number update and dummy provider correctly", async () => {
    const mockNumber = { id: "num_1", provider: "dummy", isDefault: true, status: ProviderPhoneNumberStatus.DEMO };
    hoistedMocks.tx.providerPhoneNumber.updateMany.mockResolvedValue({ count: 1 });
    hoistedMocks.tx.providerPhoneNumber.upsert.mockResolvedValue(mockNumber);
    hoistedMocks.tx.liveReadinessAuditEvent.create.mockResolvedValue({ id: "audit_1" });

    const input = {
      phoneNumber: "+123",
      label: "Test",
      provider: "dummy" as const,
      capabilities: ["sms"] as ("sms" | "mms")[],
      isDefault: true
    };

    const result = await upsertProviderPhoneNumber("org_demo", input, { actorUserId: "user_1" });

    expect(hoistedMocks.tx.providerPhoneNumber.updateMany).toHaveBeenCalledWith({
      where: { orgId: "org_demo", isDefault: true },
      data: { isDefault: false }
    });

    expect(hoistedMocks.tx.providerPhoneNumber.upsert).toHaveBeenCalledWith({
      where: { orgId_phoneNumber: { orgId: "org_demo", phoneNumber: "+123" } },
      update: expect.objectContaining({ status: ProviderPhoneNumberStatus.DEMO }),
      create: expect.objectContaining({ status: ProviderPhoneNumberStatus.DEMO })
    });

    expect(hoistedMocks.tx.liveReadinessAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROVIDER_NUMBER_UPSERTED", subjectId: "num_1" })
    });

    expect(result).toEqual(mockNumber);
  });

  it("should not call updateMany if isDefault is false, and handle real provider", async () => {
    const mockNumber = { id: "num_1", provider: "twilio", isDefault: false, status: ProviderPhoneNumberStatus.CONFIGURED };
    hoistedMocks.tx.providerPhoneNumber.upsert.mockResolvedValue(mockNumber);
    hoistedMocks.tx.liveReadinessAuditEvent.create.mockResolvedValue({ id: "audit_1" });

    const input = {
      phoneNumber: "+456",
      label: "Prod",
      provider: "twilio" as const,
      capabilities: ["sms"] as ("sms" | "mms")[],
      isDefault: false
    };

    const result = await upsertProviderPhoneNumber("org_demo", input);

    expect(hoistedMocks.tx.providerPhoneNumber.updateMany).not.toHaveBeenCalled();

    expect(hoistedMocks.tx.providerPhoneNumber.upsert).toHaveBeenCalledWith({
      where: { orgId_phoneNumber: { orgId: "org_demo", phoneNumber: "+456" } },
      update: expect.objectContaining({ status: ProviderPhoneNumberStatus.CONFIGURED }),
      create: expect.objectContaining({ status: ProviderPhoneNumberStatus.CONFIGURED })
    });

    expect(result).toEqual(mockNumber);
  });
});
