import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { parseContactImport } from "@/lib/csv/import-contacts";
import { importContacts } from "@/lib/db/repositories/contacts";
import { contactImportRequestSchema } from "@/lib/validation/contacts";

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
  const payload = contactImportRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid import payload.", issues: payload.error.issues }, { status: 400 });
  }

  const parsed = await parseContactImport(payload.data.csv);

  let contactImport;
  try {
    contactImport = await importContacts(currentOrg.orgId, parsed, payload.data.filename);
  } catch (error) {
    // Consent evidence is write-once: an import that would rewrite existing evidence is rejected
    // whole (fail-closed) rather than partially applied. Surface it as a clean 422, not a 500.
    const message = error instanceof Error ? error.message : "Contact import failed.";
    if (message.includes("Consent evidence")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    throw error;
  }

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
