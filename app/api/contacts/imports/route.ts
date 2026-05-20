import { NextResponse } from "next/server";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { parseContactImport } from "@/lib/csv/import-contacts";
import { importContacts } from "@/lib/db/repositories/contacts";
import { contactImportRequestSchema } from "@/lib/validation/contacts";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
  const payload = contactImportRequestSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid import payload.", issues: payload.error.issues }, { status: 400 });
  }

  const parsed = parseContactImport(payload.data.csv);
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
