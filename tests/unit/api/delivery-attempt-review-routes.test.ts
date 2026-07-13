import { MembershipRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listAttempts } from "@/app/api/settings/delivery-attempts/route";
import { GET as getAttempt } from "@/app/api/settings/delivery-attempts/[attemptId]/route";
import { POST as reconcileAttempt } from "@/app/api/settings/delivery-attempts/[attemptId]/reconcile/route";
import { POST as attestAttempt } from "@/app/api/settings/delivery-attempts/[attemptId]/attest-not-sent/route";
import { POST as retryAttempt } from "@/app/api/settings/delivery-attempts/[attemptId]/retry/route";

const mocks = vi.hoisted(() => ({
  attestDeliveryAttemptNotSent: vi.fn(),
  authenticateApiRequest: vi.fn(),
  getDeliveryAttempt: vi.fn(),
  listDeliveryAttempts: vi.fn(),
  reconcileDeliveryAttempt: vi.fn(),
  requestHasTrustedOrigin: vi.fn(),
  requireApiRole: vi.fn(),
  retryAttestedDeliveryAttempt: vi.fn()
}));

vi.mock("@/lib/auth/api-authentication", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest
}));

vi.mock("@/lib/auth/api-authorization", () => ({ requireApiRole: mocks.requireApiRole }));

vi.mock("@/lib/auth/request-origin", () => ({
  requestHasTrustedOrigin: mocks.requestHasTrustedOrigin
}));

vi.mock("@/lib/env/runtime-config", () => ({
  getRuntimeConfig: () => ({ web: { trustProxy: false } })
}));

vi.mock("@/lib/messaging/delivery-attempt-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/messaging/delivery-attempt-review")>()),
  attestDeliveryAttemptNotSent: mocks.attestDeliveryAttemptNotSent,
  getDeliveryAttempt: mocks.getDeliveryAttempt,
  listDeliveryAttempts: mocks.listDeliveryAttempts,
  reconcileDeliveryAttempt: mocks.reconcileDeliveryAttempt,
  retryAttestedDeliveryAttempt: mocks.retryAttestedDeliveryAttempt
}));

const routeContext = { params: Promise.resolve({ attemptId: "attempt_demo" }) };
const safeAttempt = {
  id: "attempt_demo",
  messageId: "message_demo",
  attemptNumber: 1,
  applicationStatus: "AMBIGUOUS",
  attemptStatus: "AMBIGUOUS",
  transport: "twilio",
  providerStatus: null,
  providerErrorCode: null,
  hasProviderMessageId: false,
  destinationLastFour: "0100",
  senderLastFour: "0199",
  requiresReview: true,
  canReconcile: false,
  canAttestNotSent: true,
  canRetry: false,
  timestamps: {}
};

function request(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Host: "localhost",
      Origin: "http://localhost",
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

describe("M5 ADMIN delivery-attempt review routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({
      ok: true,
      currentOrg: {
        orgId: "org_demo",
        userId: "user_admin",
        role: MembershipRole.ADMIN
      }
    });
    mocks.requireApiRole.mockReturnValue(null);
    mocks.requestHasTrustedOrigin.mockReturnValue(true);
    mocks.listDeliveryAttempts.mockResolvedValue({ attempts: [safeAttempt], nextCursor: null });
    mocks.getDeliveryAttempt.mockResolvedValue(safeAttempt);
    mocks.reconcileDeliveryAttempt.mockResolvedValue(safeAttempt);
    mocks.attestDeliveryAttemptNotSent.mockResolvedValue(safeAttempt);
    mocks.retryAttestedDeliveryAttempt.mockResolvedValue({
      ...safeAttempt,
      id: "attempt_successor",
      attemptNumber: 2,
      attemptStatus: "QUEUED"
    });
  });

  it("lists and gets only same-tenant safe ADMIN DTOs with no-store responses", async () => {
    const listResponse = await listAttempts(
      request(
        "/api/settings/delivery-attempts?applicationStatus=AMBIGUOUS&attemptStatus=AMBIGUOUS&requiresReview=true&limit=25"
      )
    );
    const getResponse = await getAttempt(
      request("/api/settings/delivery-attempts/attempt_demo"),
      routeContext
    );

    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(listResponse.headers.get("cache-control")).toContain("no-store");
    expect(getResponse.headers.get("cache-control")).toContain("no-store");
    expect(mocks.requireApiRole).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org_demo" }),
      MembershipRole.ADMIN
    );
    expect(mocks.listDeliveryAttempts).toHaveBeenCalledWith("org_demo", {
      applicationStatus: "AMBIGUOUS",
      attemptStatus: "AMBIGUOUS",
      requiresReview: true,
      limit: 25
    });
    expect(mocks.getDeliveryAttempt).toHaveBeenCalledWith("org_demo", "attempt_demo");
    expect(JSON.stringify(await getResponse.json())).not.toContain("body");
  });

  it("requires ADMIN before parsing any mutation body or calling review services", async () => {
    mocks.requireApiRole.mockReturnValue(
      Response.json({ error: "Forbidden." }, { status: 403 })
    );
    const attestRequest = request(
      "/api/settings/delivery-attempts/attempt_demo/attest-not-sent",
      "POST",
      { confirmation: "ATTEST NOT SENT", reason: "Provider confirmed no delivery." }
    );
    const retryRequest = request(
      "/api/settings/delivery-attempts/attempt_demo/retry",
      "POST",
      { confirmation: "RETRY MESSAGE" }
    );
    const attestJson = vi.spyOn(attestRequest, "json");
    const retryJson = vi.spyOn(retryRequest, "json");

    const responses = await Promise.all([
      reconcileAttempt(
        request("/api/settings/delivery-attempts/attempt_demo/reconcile", "POST"),
        routeContext
      ),
      attestAttempt(attestRequest, routeContext),
      retryAttempt(retryRequest, routeContext)
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(attestJson).not.toHaveBeenCalled();
    expect(retryJson).not.toHaveBeenCalled();
    expect(mocks.requestHasTrustedOrigin).not.toHaveBeenCalled();
    expect(mocks.reconcileDeliveryAttempt).not.toHaveBeenCalled();
    expect(mocks.attestDeliveryAttemptNotSent).not.toHaveBeenCalled();
    expect(mocks.retryAttestedDeliveryAttempt).not.toHaveBeenCalled();
  });

  it("requires exact same origin before parsing explicit confirmations", async () => {
    mocks.requestHasTrustedOrigin.mockReturnValue(false);
    const attestRequest = request(
      "/api/settings/delivery-attempts/attempt_demo/attest-not-sent",
      "POST",
      { confirmation: "ATTEST NOT SENT", reason: "Provider confirmed no delivery." }
    );
    const json = vi.spyOn(attestRequest, "json");

    const response = await attestAttempt(attestRequest, routeContext);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(json).not.toHaveBeenCalled();
    expect(mocks.attestDeliveryAttemptNotSent).not.toHaveBeenCalled();
  });

  it("passes only server-derived tenant/actor identity and exact contract inputs", async () => {
    const reconcileResponse = await reconcileAttempt(
      request("/api/settings/delivery-attempts/attempt_demo/reconcile", "POST"),
      routeContext
    );
    const attestResponse = await attestAttempt(
      request(
        "/api/settings/delivery-attempts/attempt_demo/attest-not-sent",
        "POST",
        { confirmation: "ATTEST NOT SENT", reason: "  Provider confirmed no delivery.  " }
      ),
      routeContext
    );
    const retryResponse = await retryAttempt(
      request("/api/settings/delivery-attempts/attempt_demo/retry", "POST", {
        confirmation: "RETRY MESSAGE"
      }),
      routeContext
    );

    expect([reconcileResponse.status, attestResponse.status, retryResponse.status]).toEqual([
      200, 200, 200
    ]);
    expect(mocks.reconcileDeliveryAttempt).toHaveBeenCalledWith({
      orgId: "org_demo",
      attemptId: "attempt_demo",
      actorUserId: "user_admin"
    });
    expect(mocks.attestDeliveryAttemptNotSent).toHaveBeenCalledWith({
      orgId: "org_demo",
      attemptId: "attempt_demo",
      actorUserId: "user_admin",
      reason: "Provider confirmed no delivery."
    });
    expect(mocks.retryAttestedDeliveryAttempt).toHaveBeenCalledWith({
      orgId: "org_demo",
      attemptId: "attempt_demo",
      actorUserId: "user_admin"
    });
  });

  it("rejects bodies on reconcile and rejects malformed confirmation payloads", async () => {
    const responses = await Promise.all([
      reconcileAttempt(
        request("/api/settings/delivery-attempts/attempt_demo/reconcile", "POST", {}),
        routeContext
      ),
      attestAttempt(
        request(
          "/api/settings/delivery-attempts/attempt_demo/attest-not-sent",
          "POST",
          { confirmation: "NOT SENT", reason: "Provider confirmed no delivery." }
        ),
        routeContext
      ),
      retryAttempt(
        request("/api/settings/delivery-attempts/attempt_demo/retry", "POST", {
          confirmation: "RETRY"
        }),
        routeContext
      )
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(mocks.reconcileDeliveryAttempt).not.toHaveBeenCalled();
    expect(mocks.attestDeliveryAttemptNotSent).not.toHaveBeenCalled();
    expect(mocks.retryAttestedDeliveryAttempt).not.toHaveBeenCalled();
  });
});
