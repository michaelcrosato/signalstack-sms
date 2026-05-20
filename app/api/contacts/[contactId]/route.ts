import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { archiveContact, getContact, updateContact } from "@/lib/db/repositories/contacts";
import { contactUpdateSchema } from "@/lib/validation/contacts";

type ContactParams = {
  params: Promise<{ contactId: string }>;
};

export async function GET(_request: Request, { params }: ContactParams) {
  const [{ contactId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const contact = await getContact(currentOrg.orgId, contactId);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  return NextResponse.json({ contact });
}

export async function PATCH(request: Request, { params }: ContactParams) {
  const [{ contactId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const payload = contactUpdateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid contact payload.", issues: payload.error.issues }, { status: 400 });
  }

  const contact = await updateContact(currentOrg.orgId, contactId, payload.data);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  return NextResponse.json({ contact });
}

export async function DELETE(_request: Request, { params }: ContactParams) {
  const [{ contactId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const contact = await archiveContact(currentOrg.orgId, contactId);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  return NextResponse.json({ contact });
}
