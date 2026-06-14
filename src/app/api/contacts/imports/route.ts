import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { parseContactImport } from "@/lib/csv/import-contacts";
import { importContacts } from "@/lib/db/repositories/contacts";
import { contactImportRequestSchema } from "@/lib/validation/contacts";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => undefined);
  const payload = contactImportRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid import payload.", issues: payload.error.issues }, { status: 400 });
  }

  const parsed = await parseContactImport(payload.data.csv);
  const contactImport = await importContacts(currentOrg.orgId, parsed, payload.data.filename);

  return NextResponse.json({
    import: contactImport,
    summary: {
      totalRows: parsed.totalRows,
      importedRows: parsed.contacts.length,
      failedRows: parsed.errors.length,
      errors: parsed.errors
    }
  }, { status: 201 });
}
