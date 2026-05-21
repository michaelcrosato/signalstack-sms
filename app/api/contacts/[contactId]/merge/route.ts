import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { mergeContacts } from "@/lib/db/repositories/contacts";
import { contactMergeSchema } from "@/lib/validation/contacts";

type ContactMergeParams = {
  params: Promise<{ contactId: string }>;
};

export async function POST(request: Request, { params }: ContactMergeParams) {
  const [{ contactId }, currentOrg] = await Promise.all([params, getOrCreateCurrentOrg()]);
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const payload = contactMergeSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid contact merge payload.", issues: payload.error.issues }, { status: 400 });
  }

  const contact = await mergeContacts(currentOrg.orgId, contactId, payload.data.sourceContactId);

  if (!contact) {
    return NextResponse.json({ error: "Contacts could not be merged." }, { status: 404 });
  }

  return NextResponse.json({ contact });
}
