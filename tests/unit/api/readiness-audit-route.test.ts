import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportReadinessAuditRoute } from "@/app/api/settings/readiness-audit/export/route";
import { GET as listReadinessAuditRoute } from "@/app/api/settings/readiness-audit/route";

const mocks = vi.hoisted(() => ({
  getOrCreateCurrentOrg: vi.fn(),
  listLiveReadinessAuditEvents: vi.fn(),
  serializeReadinessAuditEventsCsv: vi.fn()
}));

vi.mock("@/lib/auth/current-org", () => ({
  getOrCreateCurrentOrg: mocks.getOrCreateCurrentOrg
}));

vi.mock("@/lib/compliance/readiness-audit-export", () => ({
  serializeReadinessAuditEventsCsv: mocks.serializeReadinessAuditEventsCsv
}));

vi.mock("@/lib/db/repositories/readiness-audit", () => ({
  listLiveReadinessAuditEvents: mocks.listLiveReadinessAuditEvents
}));

describe("readiness audit API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateCurrentOrg.mockResolvedValue({
      orgId: "org_demo",
      userId: "user_demo",
      role: "OWNER",
      demoMode: true
    });
  });

  it("rejects unsupported list filters before reading local audit events", async () => {
    const response = await listReadinessAuditRoute(
      new Request("http://localhost/api/settings/readiness-audit?action=UNSUPPORTED&limit=25")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid readiness audit query."
    });
    expect(mocks.listLiveReadinessAuditEvents).not.toHaveBeenCalled();
    expect(mocks.serializeReadinessAuditEventsCsv).not.toHaveBeenCalled();
  });

  it("lists local audit events with bounded allowlisted filters", async () => {
    const events = [
      {
        id: "audit_demo",
        orgId: "org_demo",
        action: "COMPLIANCE_PROFILE_UPDATED",
        subjectType: "ComplianceProfile",
        subjectId: "compliance_demo",
        actorUserId: "user_demo",
        metadata: { complete: true },
        createdAt: "2026-05-22T00:00:00.000Z"
      }
    ];
    mocks.listLiveReadinessAuditEvents.mockResolvedValue(events);

    const response = await listReadinessAuditRoute(
      new Request(
        "http://localhost/api/settings/readiness-audit?action=COMPLIANCE_PROFILE_UPDATED&subjectType=ComplianceProfile&limit=25"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ events });
    expect(mocks.listLiveReadinessAuditEvents).toHaveBeenCalledWith("org_demo", 25, {
      action: "COMPLIANCE_PROFILE_UPDATED",
      subjectType: "ComplianceProfile",
      limit: 25
    });
    expect(mocks.serializeReadinessAuditEventsCsv).not.toHaveBeenCalled();
  });

  it("rejects unsupported export filters before reading or serializing audit events", async () => {
    const response = await exportReadinessAuditRoute(
      new Request("http://localhost/api/settings/readiness-audit/export?subjectType=SecretCredential&limit=25")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid readiness audit export query."
    });
    expect(mocks.listLiveReadinessAuditEvents).not.toHaveBeenCalled();
    expect(mocks.serializeReadinessAuditEventsCsv).not.toHaveBeenCalled();
  });

  it("exports local audit events with bounded allowlisted filters", async () => {
    const events = [
      {
        id: "audit_demo",
        orgId: "org_demo",
        action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
        subjectType: "ProviderCredential",
        subjectId: "credential_demo",
        actorUserId: "user_demo",
        metadata: {},
        createdAt: "2026-05-22T00:00:00.000Z"
      }
    ];
    mocks.listLiveReadinessAuditEvents.mockResolvedValue(events);
    mocks.serializeReadinessAuditEventsCsv.mockReturnValue("id,action\naudit_demo,PROVIDER_CREDENTIAL_METADATA_DELETED\n");

    const response = await exportReadinessAuditRoute(
      new Request(
        "http://localhost/api/settings/readiness-audit/export?action=PROVIDER_CREDENTIAL_METADATA_DELETED&subjectType=ProviderCredential&limit=25"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("id,action\naudit_demo,PROVIDER_CREDENTIAL_METADATA_DELETED\n");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(mocks.listLiveReadinessAuditEvents).toHaveBeenCalledWith("org_demo", 25, {
      action: "PROVIDER_CREDENTIAL_METADATA_DELETED",
      subjectType: "ProviderCredential",
      limit: 25
    });
    expect(mocks.serializeReadinessAuditEventsCsv).toHaveBeenCalledWith(events);
  });
});
