import { describe, expect, it } from "vitest";
import { serializeReadinessAuditEventsCsv } from "@/lib/compliance/readiness-audit-export";
import { readinessAuditQuerySchema } from "@/lib/validation/readiness-audit";

describe("readiness audit export", () => {
  it("bounds readiness audit filters to local audit values", () => {
    expect(
      readinessAuditQuerySchema.parse({
        action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
        subjectType: "ProviderCredential",
        limit: "25"
      })
    ).toEqual({
      action: "PROVIDER_CREDENTIAL_METADATA_UPSERTED",
      subjectType: "ProviderCredential",
      limit: 25
    });

    expect(readinessAuditQuerySchema.safeParse({ action: "provider:send", limit: "25" }).success).toBe(false);
    expect(readinessAuditQuerySchema.safeParse({ action: "UNSUPPORTED_LOCAL_ACTION", limit: "25" }).success).toBe(false);
    expect(readinessAuditQuerySchema.safeParse({ subjectType: "../Secret", limit: "25" }).success).toBe(false);
    expect(readinessAuditQuerySchema.safeParse({ subjectType: "UnsupportedSubject", limit: "25" }).success).toBe(false);
    expect(readinessAuditQuerySchema.safeParse({ action: "PROVIDER_NUMBER_UPSERTED", limit: "5000" }).success).toBe(false);
  });

  it("serializes audit events as escaped CSV without mutating data", () => {
    const csv = serializeReadinessAuditEventsCsv([
      {
        id: "audit_1",
        action: "COMPLIANCE_PROFILE_UPDATED",
        subjectType: "ComplianceProfile",
        subjectId: "profile_1",
        actorUserId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        metadata: { note: "quoted \"value\"", complete: true }
      }
    ]);

    expect(csv).toContain("id,action,subjectType,subjectId,actorUserId,createdAt,metadata");
    expect(csv).toContain("\"COMPLIANCE_PROFILE_UPDATED\"");
    expect(csv).toContain("\"{\"\"note\"\":\"\"quoted \\\"\"value\\\"\"\"\",\"\"complete\"\":true}\"");
  });
});
