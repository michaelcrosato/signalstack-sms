import { ConsentStatus } from "@prisma/client";
import { parseCsv } from "@/lib/csv/parse";
import { contactCreateSchema, type ContactCreateInput } from "@/lib/validation/contacts";
import { evaluatePhoneNumberLookup } from "@/lib/validation/lookup";

export type ParsedContactImport = {
  contacts: ContactCreateInput[];
  errors: Array<{ row: number; message: string }>;
  totalRows: number;
};

export async function parseContactImport(
  csv: string,
  env: Record<string, string | undefined> = process.env
): Promise<ParsedContactImport> {
  const rows = parseCsv(csv);
  const contacts: ContactCreateInput[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rawPhone = pick(row, "phone", "mobile", "mobile_phone", "phone_number");
    
    const lookup = await evaluatePhoneNumberLookup(rawPhone, env);
    if (!lookup.valid) {
      errors.push({
        row: index + 2,
        message: lookup.error || "Invalid phone number."
      });
      continue;
    }

    const parsed = contactCreateSchema.safeParse({
      phone: lookup.formattedPhone || rawPhone,
      email: emptyToUndefined(pick(row, "email", "email_address")),
      firstName: emptyToUndefined(pick(row, "first_name", "firstname")),
      lastName: emptyToUndefined(pick(row, "last_name", "lastname")),
      displayName: emptyToUndefined(pick(row, "display_name", "name", "full_name")),
      consentStatus: parseConsentStatus(pick(row, "consent_status", "consent")),
      optInSource: emptyToUndefined(pick(row, "opt_in_source", "source")),
      source: emptyToUndefined(pick(row, "import_source", "source")),
      notes: emptyToUndefined(pick(row, "notes", "note")),
      tagNames: splitNames(pick(row, "tags", "tag")),
      listNames: splitNames(pick(row, "lists", "list"))
    });

    if (parsed.success) {
      contacts.push(parsed.data);
    } else {
      errors.push({
        row: index + 2,
        message: parsed.error.issues.map((issue) => issue.message).join("; ")
      });
    }
  }

  return { contacts, errors, totalRows: rows.length };
}


function pick(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (row[key]) {
      return row[key];
    }
  }
  return "";
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function splitNames(value: string) {
  return value.split(/[;|]/).map((item) => item.trim()).filter(Boolean);
}

function parseConsentStatus(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "OPTED_IN" || normalized === "YES" || normalized === "TRUE") {
    return ConsentStatus.OPTED_IN;
  }
  if (normalized === "OPTED_OUT" || normalized === "NO" || normalized === "FALSE") {
    return ConsentStatus.OPTED_OUT;
  }
  return ConsentStatus.UNKNOWN;
}
