import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const rotations = await listProviderCredentialRotations(currentOrg.orgId, "twilio", 20);

  return NextResponse.json({ rotations });
}
