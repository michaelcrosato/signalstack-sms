import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { providerCredentialRotationQuerySchema } from "@/lib/validation/provider";

const noStoreHeaders = Object.freeze({ "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" });

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    for (const [name, value] of Object.entries(noStoreHeaders)) roleResponse.headers.set(name, value);
    return roleResponse;
  }
  const url = new URL(request.url);
  const query = providerCredentialRotationQuerySchema.safeParse({
    action: url.searchParams.get("action") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid provider credential rotation query.", issues: query.error.flatten() },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const rotations = await listProviderCredentialRotations(currentOrg.orgId, "twilio", query.data.limit, query.data.action);

  return NextResponse.json({ rotations }, { headers: noStoreHeaders });
}
