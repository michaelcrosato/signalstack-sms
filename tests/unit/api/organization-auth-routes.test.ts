import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listOrganizationsRoute, POST as createOrganizationRoute } from "@/app/api/auth/organizations/route";
import { POST as selectOrganizationRoute } from "@/app/api/auth/organizations/select/route";
import { OrganizationServiceError } from "@/lib/auth/organization-service";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  createOrganizationForUser: vi.fn(),
  getRuntimeConfig: vi.fn(),
  listOrganizationsForUser: vi.fn(),
  requireApiRole: vi.fn(),
  selectOrganizationForSession: vi.fn()
}));

vi.mock("@/lib/auth/api-authentication", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest
}));

vi.mock("@/lib/auth/api-authorization", () => ({
  requireApiRole: mocks.requireApiRole
}));

vi.mock("@/lib/auth/organization-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/organization-service")>();
  return {
    ...actual,
    createOrganizationForUser: mocks.createOrganizationForUser,
    listOrganizationsForUser: mocks.listOrganizationsForUser,
    selectOrganizationForSession: mocks.selectOrganizationForSession
  };
});

vi.mock("@/lib/env/runtime-config", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig
}));

const localSessionToken = `ss_session_${"l".repeat(43)}`;
const productionSessionToken = `ss_session_${"p".repeat(43)}`;
const bodySuppliedToken = `ss_session_${"b".repeat(43)}`;

const currentOrg = Object.freeze({
  orgId: "org-current",
  orgSlug: "current",
  orgName: "Current",
  userId: "authenticated-user",
  email: "owner@example.test",
  role: MembershipRole.OWNER,
  demoMode: false
});

const membershipSummary = Object.freeze({
  organization: Object.freeze({
    id: "org-target",
    name: "Target Organization",
    slug: "target-organization",
    timezone: "America/Vancouver",
    demoMode: false
  }),
  role: MembershipRole.OWNER
});

describe("authenticated organization API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({ ok: true, currentOrg });
    mocks.requireApiRole.mockReturnValue(null);
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig());
    mocks.listOrganizationsForUser.mockResolvedValue([membershipSummary]);
    mocks.createOrganizationForUser.mockResolvedValue(membershipSummary);
    mocks.selectOrganizationForSession.mockResolvedValue(membershipSummary);
  });

  it("lists only the authenticated user's sanitized organization summaries", async () => {
    const response = await listOrganizationsRoute();

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(mocks.authenticateApiRequest).toHaveBeenCalledWith();
    expect(mocks.listOrganizationsForUser).toHaveBeenCalledWith({
      userId: "authenticated-user"
    });
    await expect(response.json()).resolves.toEqual({ organizations: [membershipSummary] });
  });

  it("returns authentication failures before runtime or organization lookup", async () => {
    const authenticationResponse = NextResponse.json(
      { error: "Authentication required.", code: "AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    mocks.authenticateApiRequest.mockResolvedValue({ ok: false, response: authenticationResponse });

    const listResponse = await listOrganizationsRoute();
    const createRequest = mutationRequest("/api/auth/organizations", validCreateBody());
    const readBody = vi.spyOn(createRequest, "json");
    const createResponse = await createOrganizationRoute(createRequest);

    expect(listResponse).toBe(authenticationResponse);
    expect(createResponse).toBe(authenticationResponse);
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.getRuntimeConfig).not.toHaveBeenCalled();
    expect(mocks.listOrganizationsForUser).not.toHaveBeenCalled();
    expect(mocks.createOrganizationForUser).not.toHaveBeenCalled();
  });

  it("creates an organization from server-derived identity and returns 201", async () => {
    const payload = validCreateBody();
    const request = mutationRequest("/api/auth/organizations", payload);
    const readBody = vi.spyOn(request, "json");

    const response = await createOrganizationRoute(request);

    expect(response.status).toBe(201);
    expectNoStore(response);
    expect(mocks.authenticateApiRequest).toHaveBeenCalledWith(request);
    expect(mocks.requireApiRole).toHaveBeenCalledWith(currentOrg, MembershipRole.OWNER);
    expect(mocks.createOrganizationForUser).toHaveBeenCalledWith(
      { userId: "authenticated-user" },
      payload
    );
    expect(mocks.authenticateApiRequest.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requireApiRole.mock.invocationCallOrder[0]
    );
    expect(mocks.requireApiRole.mock.invocationCallOrder[0]).toBeLessThan(
      readBody.mock.invocationCallOrder[0]
    );
    await expect(response.json()).resolves.toEqual(membershipSummary);
  });

  it("enforces OWNER authorization before route-local origin checks or body parsing", async () => {
    mocks.requireApiRole.mockReturnValue(
      NextResponse.json({ error: "Requires MEMBER role or higher." }, { status: 403 })
    );
    const request = mutationRequest("/api/auth/organizations", validCreateBody(), {
      origin: "https://attacker.example"
    });
    const readBody = vi.spyOn(request, "json");

    const response = await createOrganizationRoute(request);

    expect(response.status).toBe(403);
    expectNoStore(response);
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.getRuntimeConfig).not.toHaveBeenCalled();
    expect(mocks.createOrganizationForUser).not.toHaveBeenCalled();
  });

  it("rejects cross-origin creation before parsing or persistence", async () => {
    const request = mutationRequest("/api/auth/organizations", validCreateBody(), {
      origin: "https://attacker.example"
    });
    const readBody = vi.spyOn(request, "json");

    const response = await createOrganizationRoute(request);

    expect(response.status).toBe(403);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request origin.",
      code: "INVALID_REQUEST_ORIGIN"
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.createOrganizationForUser).not.toHaveBeenCalled();
  });

  it("selects using only the environment-appropriate opaque cookie without rotating it", async () => {
    const payload = { organizationId: "org-target" };
    const request = mutationRequest("/api/auth/organizations/select", payload, {
      cookie: `signalstack_session=${localSessionToken}`
    });

    const response = await selectOrganizationRoute(request);

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.requireApiRole).toHaveBeenCalledWith(currentOrg, MembershipRole.MEMBER);
    expect(mocks.selectOrganizationForSession).toHaveBeenCalledWith(
      { userId: "authenticated-user" },
      localSessionToken,
      payload
    );
    await expect(response.json()).resolves.toEqual(membershipSummary);
  });

  it("uses the __Host cookie in production and never treats the legacy cookie as session input", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ production: true }));
    const request = mutationRequest(
      "/api/auth/organizations/select",
      { organizationId: "org-target" },
      {
        origin: "https://app.example.test",
        host: "app.example.test",
        urlOrigin: "https://app.example.test",
        cookie: [
          `signalstack_session=${localSessionToken}`,
          `__Host-signalstack_session=${productionSessionToken}`
        ].join("; ")
      }
    );

    const response = await selectOrganizationRoute(request);

    expect(response.status).toBe(200);
    expect(mocks.selectOrganizationForSession.mock.calls[0]?.[1]).toBe(productionSessionToken);
    expect(mocks.selectOrganizationForSession.mock.calls[0]?.[1]).not.toBe(localSessionToken);
  });

  it("fails selection without the appropriate cookie before parsing the body", async () => {
    const request = mutationRequest(
      "/api/auth/organizations/select",
      { organizationId: "org-target" },
      { cookie: `__Host-signalstack_session=${productionSessionToken}` }
    );
    const readBody = vi.spyOn(request, "json");

    const response = await selectOrganizationRoute(request);

    expect(response.status).toBe(401);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
      code: "AUTH_REQUIRED"
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.selectOrganizationForSession).not.toHaveBeenCalled();
  });

  it("never uses caller-supplied identity, role, or token fields for selection", async () => {
    mocks.selectOrganizationForSession.mockRejectedValueOnce(
      new OrganizationServiceError("INVALID_INPUT")
    );
    const payload = {
      organizationId: "org-target",
      userId: "other-user",
      role: MembershipRole.OWNER,
      token: bodySuppliedToken
    };
    const request = mutationRequest("/api/auth/organizations/select", payload, {
      cookie: `signalstack_session=${localSessionToken}`
    });

    const response = await selectOrganizationRoute(request);

    expect(response.status).toBe(400);
    expectNoStore(response);
    expect(mocks.selectOrganizationForSession).toHaveBeenCalledWith(
      { userId: "authenticated-user" },
      localSessionToken,
      payload
    );
    expect(mocks.selectOrganizationForSession.mock.calls[0]?.[1]).not.toBe(bodySuppliedToken);
    await expect(response.json()).resolves.toEqual({
      error: "Organization details are invalid.",
      code: "INVALID_INPUT"
    });
  });

  it("maps typed conflicts and unexpected failures to generic secret-free no-store responses", async () => {
    mocks.createOrganizationForUser.mockRejectedValueOnce(
      new OrganizationServiceError("ORGANIZATION_SLUG_UNAVAILABLE")
    );
    const conflict = await createOrganizationRoute(
      mutationRequest("/api/auth/organizations", validCreateBody())
    );
    expect(conflict.status).toBe(409);
    expectNoStore(conflict);
    await expect(conflict.json()).resolves.toEqual({
      error: "Organization slug is unavailable.",
      code: "ORGANIZATION_SLUG_UNAVAILABLE"
    });

    const internalDetail = "postgres://admin:secret@internal/database";
    mocks.listOrganizationsForUser.mockRejectedValueOnce(new Error(internalDetail));
    const unavailable = await listOrganizationsRoute();
    expect(unavailable.status).toBe(500);
    expectNoStore(unavailable);
    const unavailableBody = await unavailable.json();
    expect(unavailableBody).toEqual({
      error: "Organization operation failed.",
      code: "ORGANIZATION_OPERATION_FAILED"
    });
    expect(JSON.stringify(unavailableBody)).not.toContain(internalDetail);
  });

  it("keeps organization management unavailable outside built-in local auth", async () => {
    mocks.getRuntimeConfig.mockReturnValue(runtimeConfig({ authMode: "demo" }));

    const listResponse = await listOrganizationsRoute();
    const request = mutationRequest("/api/auth/organizations", validCreateBody());
    const readBody = vi.spyOn(request, "json");
    const createResponse = await createOrganizationRoute(request);

    for (const response of [listResponse, createResponse]) {
      expect(response.status).toBe(403);
      expectNoStore(response);
      await expect(response.json()).resolves.toEqual({
        error: "Organization management is unavailable.",
        code: "ORGANIZATION_MANAGEMENT_UNAVAILABLE"
      });
    }
    expect(readBody).not.toHaveBeenCalled();
    expect(mocks.listOrganizationsForUser).not.toHaveBeenCalled();
    expect(mocks.createOrganizationForUser).not.toHaveBeenCalled();
  });
});

function runtimeConfig(options: { production?: boolean; authMode?: "local" | "demo" } = {}) {
  return {
    auth: { mode: options.authMode ?? "local" },
    runtime: { environment: options.production ? "production" : "local" },
    web: { trustProxy: false }
  };
}

function validCreateBody() {
  return {
    name: "Target Organization",
    slug: "target-organization",
    timezone: "America/Vancouver"
  };
}

function mutationRequest(
  path: string,
  body: unknown,
  options: {
    cookie?: string;
    host?: string;
    origin?: string;
    urlOrigin?: string;
  } = {}
) {
  const urlOrigin = options.urlOrigin ?? "http://localhost:3000";
  const host = options.host ?? "localhost:3000";
  const origin = options.origin ?? urlOrigin;
  const headers = new Headers({
    "content-type": "application/json",
    host,
    origin
  });
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  return new Request(`${urlOrigin}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.headers.get("pragma")).toBe("no-cache");
}
