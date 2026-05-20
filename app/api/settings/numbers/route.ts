import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listProviderPhoneNumbers, upsertProviderPhoneNumber } from "@/lib/db/repositories/provider-numbers";
import { providerPhoneNumberSchema } from "@/lib/validation/provider";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const numbers = await listProviderPhoneNumbers(currentOrg.orgId);

  return NextResponse.json({ numbers });
}

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = providerPhoneNumberSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid provider number payload.", issues: payload.error.issues }, { status: 400 });
  }

  const number = await upsertProviderPhoneNumber(currentOrg.orgId, payload.data, {
    actorUserId: currentOrg.userId
  });

  return NextResponse.json({ number }, { status: 201 });
}
