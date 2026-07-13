import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listAccounts, POST as connectAccount } from "@/app/api/settings/provider/accounts/route";
import {
  DELETE as revokeAccount,
  GET as readAccount,
  PATCH as defaultAccount
} from "@/app/api/settings/provider/accounts/[accountId]/route";
import { POST as rotateCredential } from "@/app/api/settings/provider/accounts/[accountId]/rotate/route";
import { POST as verifyAccount } from "@/app/api/settings/provider/accounts/[accountId]/verify/route";
import { POST as checkHealth } from "@/app/api/settings/provider/accounts/[accountId]/health/route";
import { POST as discoverResources } from "@/app/api/settings/provider/accounts/[accountId]/discover/route";
import { POST as importResources } from "@/app/api/settings/provider/accounts/[accountId]/import/route";
import { GET as listNumbers } from "@/app/api/settings/provider/accounts/[accountId]/numbers/route";
import { GET as listServices } from "@/app/api/settings/provider/accounts/[accountId]/messaging-services/route";
import { PATCH as updateService } from "@/app/api/settings/provider/accounts/[accountId]/messaging-services/[serviceId]/route";
import { PATCH as updateNumber } from "@/app/api/settings/numbers/[numberId]/route";
import { ProviderAccountServiceError } from "@/lib/integrations/provider-accounts/service";
import { providerRouteError } from "@/app/api/settings/provider/accounts/_shared";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  requireApiRole: vi.fn(),
  listProviderAccounts: vi.fn(),
  getProviderAccount: vi.fn(),
  connectProviderAccount: vi.fn(),
  setDefaultProviderAccount: vi.fn(),
  revokeProviderAccount: vi.fn(),
  rotateProviderAccountCredential: vi.fn(),
  verifyProviderAccount: vi.fn(),
  checkProviderAccountHealth: vi.fn(),
  discoverProviderResources: vi.fn(),
  importProviderResources: vi.fn(),
  listOwnedProviderPhoneNumbers: vi.fn(),
  listProviderMessagingServices: vi.fn(),
  updateProviderPhoneNumberLifecycle: vi.fn(),
  updateProviderMessagingServiceLifecycle: vi.fn()
}));

vi.mock("@/lib/auth/api-authentication", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/integrations/provider-accounts/service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/integrations/provider-accounts/service")
  >();
  return {
    ...actual,
    listProviderAccounts: mocks.listProviderAccounts,
    getProviderAccount: mocks.getProviderAccount,
    connectProviderAccount: mocks.connectProviderAccount,
    setDefaultProviderAccount: mocks.setDefaultProviderAccount,
    revokeProviderAccount: mocks.revokeProviderAccount,
    rotateProviderAccountCredential: mocks.rotateProviderAccountCredential,
    verifyProviderAccount: mocks.verifyProviderAccount,
    checkProviderAccountHealth: mocks.checkProviderAccountHealth,
    discoverProviderResources: mocks.discoverProviderResources,
    importProviderResources: mocks.importProviderResources,
    listOwnedProviderPhoneNumbers: mocks.listOwnedProviderPhoneNumbers,
    listProviderMessagingServices: mocks.listProviderMessagingServices,
    updateProviderPhoneNumberLifecycle: mocks.updateProviderPhoneNumberLifecycle,
    updateProviderMessagingServiceLifecycle: mocks.updateProviderMessagingServiceLifecycle
  };
});

const currentOrg = Object.freeze({
  orgId: "org_a",
  userId: "user_admin",
  role: "ADMIN",
  demoMode: false
});
const account = Object.freeze({
  id: "provider_account_a",
  provider: "twilio",
  externalAccountIdRedacted: "AC****************************abcd",
  status: "VERIFIED"
});
const accountContext = Object.freeze({
  params: Promise.resolve({ accountId: "provider_account_a" })
});
const candidateId = `pvcandidate_v1_${"A".repeat(43)}`;

describe("M4 provider account ADMIN routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({ ok: true, currentOrg });
    mocks.requireApiRole.mockReturnValue(null);
    for (const service of serviceMocks()) service.mockResolvedValue(account);
    mocks.listProviderAccounts.mockResolvedValue([account]);
    mocks.getProviderAccount.mockResolvedValue(account);
    mocks.checkProviderAccountHealth.mockResolvedValue({
      account,
      healthy: true,
      safeCode: "OK"
    });
    mocks.discoverProviderResources.mockResolvedValue({
      credentialVersion: 1,
      phoneNumbers: [],
      messagingServices: []
    });
    mocks.importProviderResources.mockResolvedValue({
      phoneNumbers: [],
      messagingServices: []
    });
    mocks.listOwnedProviderPhoneNumbers.mockResolvedValue([{ id: "number_a" }]);
    mocks.listProviderMessagingServices.mockResolvedValue([{ id: "service_a" }]);
  });

  it("lists and reads only ADMIN-scoped safe account and resource DTOs with no-store headers", async () => {
    const responses = await Promise.all([
      listAccounts(),
      readAccount(getRequest("/api/settings/provider/accounts/provider_account_a"), accountContext),
      listNumbers(getRequest("/api/settings/provider/accounts/provider_account_a/numbers"), accountContext),
      listServices(
        getRequest("/api/settings/provider/accounts/provider_account_a/messaging-services"),
        accountContext
      )
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(responses.every((response) => response.headers.get("cache-control") === "no-store, max-age=0")).toBe(true);
    expect(mocks.listProviderAccounts).toHaveBeenCalledWith("org_a");
    expect(mocks.getProviderAccount).toHaveBeenCalledWith("org_a", "provider_account_a");
    expect(mocks.listOwnedProviderPhoneNumbers).toHaveBeenCalledWith("org_a", "provider_account_a");
    expect(mocks.listProviderMessagingServices).toHaveBeenCalledWith("org_a", "provider_account_a");
  });

  it("connects a verified account without echoing the submitted Auth Token", async () => {
    mocks.connectProviderAccount.mockResolvedValue(account);
    const authToken = "b".repeat(32);
    const response = await connectAccount(
      jsonRequest("/api/settings/provider/accounts", "POST", {
        provider: "twilio",
        externalAccountId: `AC${"a".repeat(32)}`,
        authToken,
        isDefault: true
      })
    );

    const body = await response.text();
    expect(response.status).toBe(201);
    expect(JSON.parse(body)).toEqual({ account });
    expect(body).not.toContain(authToken);
    expect(mocks.connectProviderAccount).toHaveBeenCalledWith({
      orgId: "org_a",
      externalAccountId: `AC${"a".repeat(32)}`,
      authToken,
      isDefault: true,
      actor: { userId: "user_admin" }
    });
  });

  it("runs every lifecycle operation with tenant, actor, URL account, and validated payload evidence", async () => {
    const serviceContext = Object.freeze({
      params: Promise.resolve({ accountId: "provider_account_a", serviceId: "service_a" })
    });
    const numberContext = Object.freeze({ params: Promise.resolve({ numberId: "number_a" }) });

    const responses = await Promise.all([
      defaultAccount(
        jsonRequest("/api/settings/provider/accounts/provider_account_a", "PATCH", { isDefault: true }),
        accountContext
      ),
      revokeAccount(deleteRequest("/api/settings/provider/accounts/provider_account_a"), accountContext),
      rotateCredential(
        jsonRequest("/api/settings/provider/accounts/provider_account_a/rotate", "POST", {
          authToken: "c".repeat(32)
        }),
        accountContext
      ),
      verifyAccount(postRequest("/api/settings/provider/accounts/provider_account_a/verify"), accountContext),
      checkHealth(postRequest("/api/settings/provider/accounts/provider_account_a/health"), accountContext),
      discoverResources(
        postRequest("/api/settings/provider/accounts/provider_account_a/discover"),
        accountContext
      ),
      importResources(
        jsonRequest("/api/settings/provider/accounts/provider_account_a/import", "POST", {
          credentialVersion: 1,
          phoneNumberCandidateIds: [candidateId],
          messagingServiceCandidateIds: [],
          defaultPhoneNumberCandidateId: candidateId
        }),
        accountContext
      ),
      updateService(
        jsonRequest(
          "/api/settings/provider/accounts/provider_account_a/messaging-services/service_a",
          "PATCH",
          { disable: true }
        ),
        serviceContext
      ),
      updateNumber(
        jsonRequest("/api/settings/numbers/number_a", "PATCH", { makeDefault: true }),
        numberContext
      )
    ]);

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(mocks.setDefaultProviderAccount).toHaveBeenCalledWith(providerAccountInput());
    expect(mocks.revokeProviderAccount).toHaveBeenCalledWith(providerAccountInput());
    expect(mocks.verifyProviderAccount).toHaveBeenCalledWith(providerAccountInput());
    expect(mocks.checkProviderAccountHealth).toHaveBeenCalledWith(providerAccountInput());
    expect(mocks.discoverProviderResources).toHaveBeenCalledWith({
      orgId: "org_a",
      providerAccountId: "provider_account_a",
      actor: { userId: "user_admin" }
    });
    expect(mocks.rotateProviderAccountCredential).toHaveBeenCalledWith({
      ...providerAccountInput(),
      authToken: "c".repeat(32)
    });
    expect(mocks.importProviderResources).toHaveBeenCalledWith({
      ...providerAccountInput(),
      credentialVersion: 1,
      phoneNumberCandidateIds: [candidateId],
      messagingServiceCandidateIds: [],
      defaultPhoneNumberCandidateId: candidateId
    });
    expect(mocks.updateProviderMessagingServiceLifecycle).toHaveBeenCalledWith({
      orgId: "org_a",
      providerAccountId: "provider_account_a",
      messagingServiceId: "service_a",
      disable: true,
      actor: { userId: "user_admin" }
    });
    expect(mocks.updateProviderPhoneNumberLifecycle).toHaveBeenCalledWith({
      orgId: "org_a",
      phoneNumberId: "number_a",
      makeDefault: true,
      actor: { userId: "user_admin" }
    });
  });

  it("requires ADMIN before every body-bearing route reads JSON or calls a service", async () => {
    mocks.requireApiRole.mockReturnValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    const calls = bodyBearingCalls();

    for (const call of calls) {
      const bodySpy = vi.spyOn(call.request, "json");
      const response = await call.run(call.request);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
      expect(bodySpy).not.toHaveBeenCalled();
    }
    expect(serviceMocks().every((service) => service.mock.calls.length === 0)).toBe(true);
  });

  it("rejects malformed secret-bearing JSON generically without echoing input or calling the service", async () => {
    const rawSecret = "raw-secret-that-must-not-return";
    const response = await connectAccount(
      new Request("http://localhost/api/settings/provider/accounts", {
        method: "POST",
        headers: sameOriginHeaders(),
        body: JSON.stringify({
          provider: "twilio",
          externalAccountId: "bad",
          authToken: rawSecret
        })
      })
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("INVALID_PROVIDER_REQUEST");
    expect(body).not.toContain(rawSecret);
    expect(mocks.connectProviderAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_PROVIDER_ACCOUNT", 400],
    ["PROVIDER_ACCOUNT_NOT_FOUND", 404],
    ["PROVIDER_ACCOUNT_CONFLICT", 409],
    ["PROVIDER_DISCOVERY_STALE", 409],
    ["PROVIDER_IMPORT_INVALID", 422],
    ["PROVIDER_VERIFICATION_FAILED", 502],
    ["PROVIDER_DISCOVERY_FAILED", 502],
    ["PROVIDER_CREDENTIAL_UNAVAILABLE", 503],
    ["PROVIDER_OWNERSHIP_CONFLICT", 409],
    ["PROVIDER_RESOURCE_NOT_FOUND", 404]
  ] as const)("maps %s to a stable secret-free %i", async (code, status) => {
    const rawMessage = `raw provider detail for ${code}`;
    const response = providerRouteError(new ProviderAccountServiceError(code, rawMessage));
    const body = await response.text();

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toContain(code);
    expect(body).not.toContain(rawMessage);
  });

  it("maps unexpected failures to a generic no-store 503 without reflecting the error", async () => {
    const response = providerRouteError(new Error("database password leaked here"));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("PROVIDER_SERVICE_UNAVAILABLE");
    expect(body).not.toContain("database password");
  });
});

function providerAccountInput() {
  return {
    orgId: "org_a",
    providerAccountId: "provider_account_a",
    actor: { userId: "user_admin" }
  };
}

function serviceMocks() {
  return [
    mocks.listProviderAccounts,
    mocks.getProviderAccount,
    mocks.connectProviderAccount,
    mocks.setDefaultProviderAccount,
    mocks.revokeProviderAccount,
    mocks.rotateProviderAccountCredential,
    mocks.verifyProviderAccount,
    mocks.checkProviderAccountHealth,
    mocks.discoverProviderResources,
    mocks.importProviderResources,
    mocks.listOwnedProviderPhoneNumbers,
    mocks.listProviderMessagingServices,
    mocks.updateProviderPhoneNumberLifecycle,
    mocks.updateProviderMessagingServiceLifecycle
  ];
}

function bodyBearingCalls(): Array<{
  request: Request;
  run: (request: Request) => Promise<Response>;
}> {
  const serviceContext = {
    params: Promise.resolve({ accountId: "provider_account_a", serviceId: "service_a" })
  };
  const numberContext = { params: Promise.resolve({ numberId: "number_a" }) };
  return [
    {
      request: jsonRequest("/api/settings/provider/accounts", "POST", {}),
      run: (request) => connectAccount(request)
    },
    {
      request: jsonRequest("/api/settings/provider/accounts/provider_account_a", "PATCH", {}),
      run: (request) => defaultAccount(request, accountContext)
    },
    {
      request: jsonRequest("/api/settings/provider/accounts/provider_account_a/rotate", "POST", {}),
      run: (request) => rotateCredential(request, accountContext)
    },
    {
      request: jsonRequest("/api/settings/provider/accounts/provider_account_a/import", "POST", {}),
      run: (request) => importResources(request, accountContext)
    },
    {
      request: jsonRequest(
        "/api/settings/provider/accounts/provider_account_a/messaging-services/service_a",
        "PATCH",
        {}
      ),
      run: (request) => updateService(request, serviceContext)
    },
    {
      request: jsonRequest("/api/settings/numbers/number_a", "PATCH", {}),
      run: (request) => updateNumber(request, numberContext)
    }
  ];
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`);
}

function postRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { Origin: "http://localhost", Host: "localhost" }
  });
}

function deleteRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "DELETE",
    headers: { Origin: "http://localhost", Host: "localhost" }
  });
}

function jsonRequest(path: string, method: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: sameOriginHeaders(),
    body: JSON.stringify(body)
  });
}

function sameOriginHeaders() {
  return {
    "Content-Type": "application/json",
    Origin: "http://localhost",
    Host: "localhost"
  };
}
