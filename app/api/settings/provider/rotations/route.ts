import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { providerCredentialRotationQuerySchema } from "@/lib/validation/provider";

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const url = new URL(request.url);
  const query = providerCredentialRotationQuerySchema.safeParse({
    action: url.searchParams.get("action") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!query.success) {
    return NextResponse.json({ error: "Invalid provider credential rotation query.", issues: query.error.flatten() }, { status: 400 });
  }

  const rotations = await listProviderCredentialRotations(currentOrg.orgId, "twilio", query.data.limit, query.data.action);

  return NextResponse.json({ rotations });
}
