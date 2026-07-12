import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { requireApiRole } from "@/lib/auth/api-authorization";
import {
  ApiCredentialServiceError,
  revokeApiCredential,
  rotateApiCredential
} from "@/lib/public-api/api-credential-service";
import { apiCredentialIdSchema } from "@/lib/validation/api-credentials";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" } as const;
type RouteContext = { params: Promise<{ credentialId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }
  const credentialId = apiCredentialIdSchema.safeParse((await context.params).credentialId);
  if (!credentialId.success) {
    return NextResponse.json({ error: "API credential not found." }, { status: 404, headers: noStoreHeaders });
  }

  try {
    const revealed = await rotateApiCredential({
      orgId: currentOrg.orgId,
      credentialId: credentialId.data,
      actor: { kind: "user", userId: currentOrg.userId }
    });
    return NextResponse.json(revealed, { headers: noStoreHeaders });
  } catch (error) {
    return credentialErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }
  const credentialId = apiCredentialIdSchema.safeParse((await context.params).credentialId);
  if (!credentialId.success) {
    return NextResponse.json({ error: "API credential not found." }, { status: 404, headers: noStoreHeaders });
  }

  try {
    const credential = await revokeApiCredential({
      orgId: currentOrg.orgId,
      credentialId: credentialId.data,
      actor: { kind: "user", userId: currentOrg.userId }
    });
    return NextResponse.json({ credential }, { headers: noStoreHeaders });
  } catch (error) {
    return credentialErrorResponse(error);
  }
}

function credentialErrorResponse(error: unknown) {
  if (error instanceof ApiCredentialServiceError && error.code === "API_CREDENTIAL_NOT_FOUND") {
    return NextResponse.json({ error: "API credential not found." }, { status: 404, headers: noStoreHeaders });
  }
  if (error instanceof ApiCredentialServiceError && error.code === "API_CREDENTIAL_REVOKED") {
    return NextResponse.json({ error: error.message }, { status: 409, headers: noStoreHeaders });
  }
  return NextResponse.json(
    { error: "API credential service unavailable.", code: "SERVICE_UNAVAILABLE" },
    { status: 503, headers: noStoreHeaders }
  );
}
