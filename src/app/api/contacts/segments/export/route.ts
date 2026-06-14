import { z } from "zod";
import { ConsentStatus } from "@prisma/client";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { evaluateSegmentContacts, type SegmentFilter } from "@/lib/db/repositories/segments";
import { withOptionalTenantRls } from "@/lib/db/rls";


const segmentFilterSchema = z.object({
  tagNames: z.array(z.string()).optional(),
  consentStatuses: z.array(z.nativeEnum(ConsentStatus)).optional(),
  minLeadScore: z.number().int().optional(),
  maxLeadScore: z.number().int().optional(),
});

export async function GET(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();
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
    const consentStatuses = searchParams.get("consentStatuses")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const minLeadScore = searchParams.get("minLeadScore");
    const maxLeadScore = searchParams.get("maxLeadScore");

    if (tagNames && tagNames.length > 0) filter.tagNames = tagNames;
    if (consentStatuses && consentStatuses.length > 0) filter.consentStatuses = consentStatuses as ConsentStatus[];
    if (minLeadScore) filter.minLeadScore = parseInt(minLeadScore, 10);
    if (maxLeadScore) filter.maxLeadScore = parseInt(maxLeadScore, 10);
  }

  const contacts = await withOptionalTenantRls(currentOrg.orgId, async (tx) => {
    return evaluateSegmentContacts(currentOrg.orgId, filter, tx);
  });

  // Build CSV content
  let csvContent = "Phone,Email,FirstName,LastName,DisplayName,ConsentStatus,LeadScore,Tags,Lists\n";

  for (const c of contacts) {
    const email = c.email || "";
    const firstName = c.firstName || "";
    const lastName = c.lastName || "";
    const displayName = c.displayName || "";
    const consentStatus = c.consentStatus;
    const leadScore = c.leadScore !== null && c.leadScore !== undefined ? c.leadScore : "";
    const tags = c.tagLinks.map((tl) => tl.tag.name).join(";");
    const lists = c.listLinks.map((ll) => ll.list.name).join(";");

    const escapeCsv = (val: unknown) => {
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    csvContent += `${escapeCsv(c.phone)},${escapeCsv(email)},${escapeCsv(firstName)},${escapeCsv(lastName)},${escapeCsv(displayName)},${escapeCsv(consentStatus)},${escapeCsv(leadScore)},${escapeCsv(tags)},${escapeCsv(lists)}\n`;
  }

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="segment-contacts.csv"'
    }
  });
}
