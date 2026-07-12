import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { requireApiRole } from "@/lib/auth/api-authorization";
import {
  createApiCredential,
  listApiCredentials
} from "@/lib/public-api/api-credential-service";
import { apiCredentialCreateSchema } from "@/lib/validation/api-credentials";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" } as const;

export async function GET() {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const credentials = await listApiCredentials(currentOrg.orgId);
  return NextResponse.json({ credentials }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const payload = apiCredentialCreateSchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid API credential payload.", issues: payload.error.issues },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const revealed = await createApiCredential({
      orgId: currentOrg.orgId,
      name: payload.data.name,
      scopes: payload.data.scopes,
      rateLimitPerMinute: payload.data.rateLimitPerMinute,
      expiresAt: payload.data.expiresAt,
      actor: { kind: "user", userId: currentOrg.userId }
    });
    return NextResponse.json(revealed, { status: 201, headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { error: "API credential service unavailable.", code: "SERVICE_UNAVAILABLE" },
      { status: 503, headers: noStoreHeaders }
    );
  }
}
