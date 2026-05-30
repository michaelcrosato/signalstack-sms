import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listContacts, upsertContact } from "@/lib/db/repositories/contacts";
import { contactCreateSchema } from "@/lib/validation/contacts";
import { evaluatePhoneNumberLookup } from "@/lib/validation/lookup";

export async function GET() {
  const currentOrg = await getOrCreateCurrentOrg();
  const contacts = await listContacts(currentOrg.orgId);

  return NextResponse.json({ contacts });
}

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = contactCreateSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid contact payload.", issues: payload.error.issues }, { status: 400 });
  }

  const lookup = await evaluatePhoneNumberLookup(payload.data.phone);
  if (!lookup.valid) {
    return NextResponse.json({ error: lookup.error || "Invalid phone number." }, { status: 400 });
  }

  payload.data.phone = lookup.formattedPhone || payload.data.phone;

  const contact = await upsertContact(currentOrg.orgId, payload.data);
  return NextResponse.json({ contact }, { status: 201 });
}

