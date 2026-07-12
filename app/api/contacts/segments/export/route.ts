import { z } from "zod";
import { ConsentStatus } from "@prisma/client";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { evaluateSegmentContacts, type SegmentFilter } from "@/lib/db/repositories/segments";
import { withOptionalTenantRls } from "@/lib/db/rls";
import { escapeCsvCell } from "@/lib/csv/escape";


const segmentFilterSchema = z.object({
  tagNames: z.array(z.string()).optional(),
  consentStatuses: z.array(z.nativeEnum(ConsentStatus)).optional(),
  minLeadScore: z.number().int().optional(),
  maxLeadScore: z.number().int().optional(),
});

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) {
    return authentication.response;
  }
  const { currentOrg } = authentication;
  const { searchParams } = new URL(request.url);

  let filter: SegmentFilter = {};

  const filterJson = searchParams.get("filter");
  if (filterJson) {
    try {
      const parsed = JSON.parse(filterJson);
      const result = segmentFilterSchema.safeParse(parsed);
      if (!result.success) {
        return new Response("Invalid filter format.", { status: 400 });
      }
      filter = result.data;
    } catch {
      return new Response("Invalid JSON in filter parameter.", { status: 400 });
    }
  } else {
    const tagNames = searchParams.get("tagNames")?.split(",").map((t) => t.trim()).filter(Boolean);
    const consentStatuses = searchParams
      .get("consentStatuses")
      ?.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const minLeadScore = searchParams.get("minLeadScore");
    const maxLeadScore = searchParams.get("maxLeadScore");

    // Validate the query-param path through the same schema as the JSON path so an unknown consent
    // status or non-numeric score returns 400 rather than reaching Prisma as an invalid enum (500).
    const candidate: Record<string, unknown> = {};
    if (tagNames && tagNames.length > 0) candidate.tagNames = tagNames;
    if (consentStatuses && consentStatuses.length > 0) candidate.consentStatuses = consentStatuses;
    if (minLeadScore !== null) candidate.minLeadScore = Number(minLeadScore);
    if (maxLeadScore !== null) candidate.maxLeadScore = Number(maxLeadScore);

    const result = segmentFilterSchema.safeParse(candidate);
    if (!result.success) {
      return new Response("Invalid filter parameters.", { status: 400 });
    }
    filter = result.data;
  }

  const contacts = await withOptionalTenantRls(currentOrg.orgId, async (tx) => {
    return evaluateSegmentContacts(currentOrg.orgId, filter, tx);
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
