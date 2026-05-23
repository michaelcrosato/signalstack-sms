import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { listContacts, upsertContact } from "@/lib/db/repositories/contacts";
import { contactCreateSchema } from "@/lib/validation/contacts";

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

  const contact = await upsertContact(currentOrg.orgId, payload.data);
  return NextResponse.json({ contact }, { status: 201 });
}
