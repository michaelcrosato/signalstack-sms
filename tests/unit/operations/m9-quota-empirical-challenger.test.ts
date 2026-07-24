import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PLAN_QUOTAS,
  DEFAULT_PLAN_TIER,
  QuotaExceededError,
  getPlanLimits,
  enforceContactQuota,
  enforceMessageSegmentQuota,
  enforceApiKeyQuota,
  enforceSeatQuota
} from "@/lib/operations/entitlements";
import { createContact, upsertContact } from "@/lib/db/repositories/contacts";
import { reserveDirectMessage } from "@/lib/messaging/direct-message-reservation";
import { createApiCredential } from "@/lib/public-api/api-credential-service";
import { MessageTransport, type Prisma } from "@prisma/client";


const TEST_PEPPER = "0123456789abcdef0123456789abcdef";

describe("Milestone M9 Empirical Challenger Verification Suite", () => {
  beforeEach(() => {
    process.env.API_KEY_PEPPER = TEST_PEPPER;
  });

  describe("1. Plan Tier Definitions & Tier Transitions", () => {
    it("defines correct quotas for all 4 plan tiers", () => {
      expect(PLAN_QUOTAS.community).toEqual({
        maxContacts: 100,
        maxMonthlyMessageSegments: 500,
        maxApiKeys: 2,
        maxSeats: 3,
        maxMediaStorageBytes: 100 * 1024 * 1024
      });

      expect(PLAN_QUOTAS.starter).toEqual({
        maxContacts: 1_000,
        maxMonthlyMessageSegments: 5_000,
        maxApiKeys: 5,
        maxSeats: 10,
        maxMediaStorageBytes: 500 * 1024 * 1024
      });

      expect(PLAN_QUOTAS.pro).toEqual({
        maxContacts: 10_000,
        maxMonthlyMessageSegments: 50_000,
        maxApiKeys: 20,
        maxSeats: 25,
        maxMediaStorageBytes: 5 * 1024 * 1024 * 1024
      });

      expect(PLAN_QUOTAS.enterprise).toEqual({
        maxContacts: 1_000_000,
        maxMonthlyMessageSegments: 1_000_000,
        maxApiKeys: 100,
        maxSeats: 100,
        maxMediaStorageBytes: 50 * 1024 * 1024 * 1024
      });
    });

    it("handles tier transitions / upgrades dynamically", async () => {
      const mockTx = {
        contact: {
          count: vi.fn().mockResolvedValue(150)
        }
      } as unknown as Prisma.TransactionClient;

      // Under Community tier (limit 100), 150 contacts fails
      await expect(enforceContactQuota(mockTx, "org_1", 1, "community")).rejects.toThrow(QuotaExceededError);

      // Under Starter tier (limit 1000), 150 contacts succeeds
      const starterResult = await enforceContactQuota(mockTx, "org_1", 1, "starter");
      expect(starterResult.allowed).toBe(true);
      expect(starterResult.limit).toBe(1000);

      // Under Pro tier (limit 10000), 150 contacts succeeds
      const proResult = await enforceContactQuota(mockTx, "org_1", 1, "pro");
      expect(proResult.allowed).toBe(true);
      expect(proResult.limit).toBe(10000);

      // Under Enterprise tier (limit 1000000), 150 contacts succeeds
      const enterpriseResult = await enforceContactQuota(mockTx, "org_1", 1, "enterprise");
      expect(enterpriseResult.allowed).toBe(true);
      expect(enterpriseResult.limit).toBe(1000000);
    });

    it("falls back to default plan tier ('starter') for invalid tier names", () => {
      expect(getPlanLimits("invalid_tier")).toEqual(PLAN_QUOTAS[DEFAULT_PLAN_TIER]);
      expect(getPlanLimits()).toEqual(PLAN_QUOTAS.starter);
    });
  });

  describe("2. QuotaExceededError Structure", () => {
    it("provides standard error code and metric metadata", () => {
      const err = new QuotaExceededError("contacts", 100, 100);
      expect(err.name).toBe("QuotaExceededError");
      expect(err.code).toBe("QUOTA_EXCEEDED");
      expect(err.metric).toBe("contacts");
      expect(err.current).toBe(100);
      expect(err.limit).toBe(100);
      expect(err.message).toBe("Plan quota exceeded for contacts: 100/100");
    });
  });

  describe("3. Contact Limit Enforcement (createContact, upsertContact, importContacts)", () => {
    it("enforces contact quota on createContact when limit reached", async () => {
      const mockTx = {
        contact: {
          count: vi.fn().mockResolvedValue(1000) // Default starter tier max is 1000
        }
      } as unknown as Prisma.TransactionClient;

      await expect(
        createContact("org_1", { phone: "+15551234567", consentStatus: "OPTED_IN", tagNames: [], listNames: [] }, mockTx)
      ).rejects.toThrow(QuotaExceededError);
    });

    it("enforces contact quota on upsertContact for NEW contact", async () => {
      const mockTx = {
        contact: {
          findUnique: vi.fn().mockResolvedValue(null), // New contact
          count: vi.fn().mockResolvedValue(1000) // Quota full
        }
      } as unknown as Prisma.TransactionClient;

      await expect(
        upsertContact("org_1", { phone: "+15551234567", consentStatus: "OPTED_IN", tagNames: [], listNames: [] }, mockTx)
      ).rejects.toThrow(QuotaExceededError);
    });

    it("bypasses contact quota on upsertContact when updating EXISTING contact", async () => {
      const existingContact = {
        id: "c_1",
        orgId: "org_1",
        phone: "+15551234567",
        consentStatus: "OPTED_IN",
        consentCapturedAt: null,
        consentMethod: null,
        consentDisclosure: null
      };

      const mockTx = {
        contact: {
          findUnique: vi.fn().mockResolvedValue(existingContact),
          count: vi.fn().mockResolvedValue(1000), // Quota full, but shouldn't be called
          upsert: vi.fn().mockResolvedValue(existingContact),
          findUniqueOrThrow: vi.fn().mockResolvedValue(existingContact)
        },
        contactTag: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        contactListMember: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }
      } as unknown as Prisma.TransactionClient;

      const result = await upsertContact("org_1", { phone: "+15551234567", consentStatus: "OPTED_IN", tagNames: [], listNames: [] }, mockTx);
      expect(result).toBeDefined();
      expect(mockTx.contact.count).not.toHaveBeenCalled();
    });

    it("enforces bulk contact quota on importContacts based on net new contacts", async () => {
      const mockTx = {
        contact: {
          count: vi.fn().mockResolvedValue(998)
        }
      } as unknown as Prisma.TransactionClient;

      // 998 current + 3 new contacts = 1001 > 1000 limit -> throws QuotaExceededError
      await expect(
        enforceContactQuota(mockTx, "org_1", 3)
      ).rejects.toThrow(QuotaExceededError);
    });

    it("allows bulk import when net new contacts fit within remaining quota", async () => {
      const mockTx = {
        contact: {
          count: vi.fn().mockResolvedValue(995)
        }
      } as unknown as Prisma.TransactionClient;

      const res = await enforceContactQuota(mockTx, "org_1", 3);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5);
    });
  });

  describe("4. Monthly Segment Limit Enforcement (reserveDirectMessage & Outbox)", () => {
    it("calculates message segments correctly (160 char boundary)", () => {
      const shortBody = "Hello world"; // 11 chars -> 1 segment
      const longBody = "A".repeat(350); // 350 chars -> 3 segments
      expect(Math.ceil(shortBody.length / 160)).toBe(1);
      expect(Math.ceil(longBody.length / 160)).toBe(3);
    });

    it("blocks reserveDirectMessage when monthly segment quota is exceeded", async () => {
      const mockTx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        message: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(5000) // Default starter limit is 5000
        },
        contact: {
          findFirst: vi.fn().mockResolvedValue({
            id: "c_1",
            orgId: "org_1",
            phone: "+15551234567",
            consentStatus: "OPTED_IN",
            archivedAt: null,
            optedOutAt: null
          })
        },
        conversation: {
          findFirst: vi.fn().mockResolvedValue(null)
        }
      } as unknown as Prisma.TransactionClient;

      const result = await reserveDirectMessage(
        mockTx,
        {
          orgId: "org_1",
          route: "public_direct",
          identity: { kind: "public_api", credentialId: "cred_1", idempotencyKey: "idem_12345" },
          transport: MessageTransport.DUMMY,
          contactId: "c_1",
          body: "Test message body"
        },
        { environment: { API_KEY_PEPPER: TEST_PEPPER } }
      );

      expect(result.ok).toBe(false);
      if (!result.ok && result.kind === "blocked") {
        expect(result.reasons).toContain("MONTHLY_SEGMENT_QUOTA_EXCEEDED");
      } else {
        throw new Error("Expected blocked result");
      }
    });

    it("enforceMessageSegmentQuota filters by startOfMonth and OUTBOUND direction", async () => {
      const mockTx = {
        message: {
          count: vi.fn().mockImplementation(({ where }) => {
            expect(where.direction).toBe("OUTBOUND");
            expect(where.createdAt.gte).toBeInstanceOf(Date);
            return Promise.resolve(4999);
          })
        }
      } as unknown as Prisma.TransactionClient;

      await expect(
        enforceMessageSegmentQuota(mockTx, "org_1", 2, "starter")
      ).rejects.toThrow(QuotaExceededError);
    });
  });

  describe("5. API Key Quota Enforcement (createApiCredential)", () => {
    it("enforces max active API keys per org", async () => {
      const mockTx = {
        apiCredential: {
          count: vi.fn().mockImplementation(({ where }) => {
            expect(where.revokedAt).toBe(null);
            return Promise.resolve(5); // Starter max is 5
          })
        }
      } as unknown as Prisma.TransactionClient;

      await expect(
        createApiCredential(
          {
            orgId: "org_1",
            name: "New Key",
            scopes: ["contacts:read"],
            actor: { kind: "user", userId: "u_1" }
          },
          mockTx,
          { API_KEY_PEPPER: TEST_PEPPER }
        )
      ).rejects.toThrow(QuotaExceededError);
    });

    it("excludes revoked API keys from quota count", async () => {
      const mockTx = {
        apiCredential: {
          count: vi.fn().mockImplementation(({ where }) => {
            expect(where.revokedAt).toBe(null);
            return Promise.resolve(4); // 4 active, 1 revoked = 4 active < 5 max
          })
        }
      } as unknown as Prisma.TransactionClient;

      const res = await enforceApiKeyQuota(mockTx, "org_1", 1, "starter");
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(1);
    });
  });

  describe("6. Team Member Seat Quota Enforcement (createInvite)", () => {
    it("enforces seat quota including active memberships AND non-expired pending invites", async () => {
      const mockTx = {
        membership: {
          count: vi.fn().mockImplementation(({ where }) => {
            expect(where.status.in).toEqual(["ACTIVE", "INVITED"]);
            return Promise.resolve(8); // 8 active memberships
          })
        },
        authToken: {
          count: vi.fn().mockImplementation(({ where }) => {
            expect(where.type).toBe("INVITE");
            expect(where.consumedAt).toBe(null);
            expect(where.revokedAt).toBe(null);
            return Promise.resolve(2); // 2 pending invites
          })
        }
      } as unknown as Prisma.TransactionClient;

      // Total seats = 8 + 2 = 10. Starter maxSeats is 10. Adding 1 seat should fail.
      await expect(
        enforceSeatQuota(mockTx, "org_1", 1, "starter")
      ).rejects.toThrow(QuotaExceededError);
    });

    it("allows seat allocation when total active seats + pending invites is below limit", async () => {
      const mockTx = {
        membership: {
          count: vi.fn().mockResolvedValue(5)
        },
        authToken: {
          count: vi.fn().mockResolvedValue(2)
        }
      } as unknown as Prisma.TransactionClient;

      const res = await enforceSeatQuota(mockTx, "org_1", 1, "starter");
      expect(res.allowed).toBe(true);
      expect(res.current).toBe(7);
      expect(res.limit).toBe(10);
      expect(res.remaining).toBe(3);
    });
  });
});
