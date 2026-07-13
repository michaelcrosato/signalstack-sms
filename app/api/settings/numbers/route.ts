import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { listProviderPhoneNumbers, upsertProviderPhoneNumber } from "@/lib/db/repositories/provider-numbers";
import { toSafeProviderPhoneNumber } from "@/lib/integrations/provider-accounts/safe-dtos";
import { providerPhoneNumberSchema } from "@/lib/validation/provider";

const noStoreHeaders = Object.freeze({ "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" });

function isUniqueConstraintConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function GET() {
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
  const numbers = await listProviderPhoneNumbers(currentOrg.orgId);

  return NextResponse.json(
    { numbers: numbers.map(toSafeProviderPhoneNumber) },
    { headers: noStoreHeaders }
  );
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

  const rawPayload = await request.json().catch(() => undefined);
  const payload = providerPhoneNumberSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid provider number payload.", issues: payload.error.issues }, { status: 400 });
  }

  try {
    const number = await upsertProviderPhoneNumber(currentOrg.orgId, payload.data, {
      actorUserId: currentOrg.userId
    });

    return NextResponse.json(
      { number: toSafeProviderPhoneNumber(number) },
      { status: 201, headers: noStoreHeaders }
    );
  } catch (error) {
    if (!isUniqueConstraintConflict(error)) {
      return NextResponse.json(
        { error: "Provider number metadata update failed." },
        { status: 500, headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      { error: "Provider number metadata conflicted with another update." },
      { status: 409, headers: noStoreHeaders }
    );
  }
}
