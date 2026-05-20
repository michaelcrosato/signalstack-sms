import { NextResponse } from "next/server";
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
  const payload = contactCreateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid contact payload.", issues: payload.error.issues }, { status: 400 });
  }

  const contact = await upsertContact(currentOrg.orgId, payload.data);
  return NextResponse.json({ contact }, { status: 201 });
}
