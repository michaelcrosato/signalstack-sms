import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { evaluateSegmentContacts } from "@/lib/db/repositories/segments";
import { withOptionalTenantRls } from "@/lib/db/rls";
import { escapeCsvCell } from "@/lib/csv/escape";
import { parseSegmentFilterParams } from "@/lib/validation/segments";

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { searchParams } = new URL(request.url);

  const parsedFilter = parseSegmentFilterParams(searchParams);
  if (!parsedFilter.ok) {
    return new Response(parsedFilter.error, { status: 400 });
  }

  const contacts = await withOptionalTenantRls(currentOrg.orgId, async (tx) => {
    return evaluateSegmentContacts(currentOrg.orgId, parsedFilter.filter, tx);
  });

  const csvRows = ["Phone,Email,FirstName,LastName,DisplayName,ConsentStatus,LeadScore,Tags,Lists"];

  for (const c of contacts) {
    const email = c.email || "";
    const firstName = c.firstName || "";
    const lastName = c.lastName || "";
    const displayName = c.displayName || "";
    const consentStatus = c.consentStatus;
    const leadScore = c.leadScore !== null && c.leadScore !== undefined ? c.leadScore : "";
    const tags = c.tagLinks.map((tl) => tl.tag.name).join(";");
    const lists = c.listLinks.map((ll) => ll.list.name).join(";");

    csvRows.push(
      [c.phone, email, firstName, lastName, displayName, consentStatus, leadScore, tags, lists]
        .map((value) => escapeCsvCell(value))
        .join(",")
    );
  }

  const csvContent = `${csvRows.join("\n")}\n`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="segment-contacts.csv"'
    }
  });
}
