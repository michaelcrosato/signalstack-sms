import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listProviderCredentialRotations } from "@/lib/db/repositories/provider-credentials";
import { serializeProviderCredentialRotationsCsv } from "@/lib/messaging/provider/credential-rotation-export";
import { providerCredentialRotationQuerySchema } from "@/lib/validation/provider";

export async function GET(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const url = new URL(request.url);
  const query = providerCredentialRotationQuerySchema.safeParse({
    action: url.searchParams.get("action") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!query.success) {
    return NextResponse.json({ error: "Invalid provider credential rotation export query.", issues: query.error.flatten() }, { status: 400 });
  }

  const rotations = await listProviderCredentialRotations(currentOrg.orgId, "twilio", query.data.limit, query.data.action);
  const csv = serializeProviderCredentialRotationsCsv(rotations);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"signalstack-provider-credential-rotations.csv\""
    }
  });
}
