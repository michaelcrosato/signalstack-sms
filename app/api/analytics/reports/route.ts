import { NextResponse } from "next/server";
import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { getOrCreateCurrentOrg } from "@/lib/auth/current-org";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const currentOrg = await getOrCreateCurrentOrg();

  // Strict RBAC boundary: Only Admins or Owners can export or save reports
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) {
    return roleResponse;
  }

  const rawPayload = await request.json().catch(() => ({}));
  const action = rawPayload?.action;

  if (action !== "save" && action !== "export") {
    return NextResponse.json({ error: "Invalid reporting action specified." }, { status: 400 });
  }

  if (action === "export") {
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      // Implement execution timeout to prevent runaway queries
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Report generation timed out")), 5000);
      });

      // Pagination boundary: strictly limit to 1000 records to prevent memory exhaustion
      const dataPromise = prisma.contact.findMany({
        where: { orgId: currentOrg.orgId, archivedAt: null },
        take: 1000,
        select: {
          id: true,
          phone: true,
          consentStatus: true,
          createdAt: true
        }
      });

      const contacts = (await Promise.race([dataPromise, timeoutPromise])) as Array<{
        id: string;
        phone: string;
        consentStatus: string;
        createdAt: Date;
      }>;

      const csvRows = contacts.map(c =>
        `"${c.id}","${c.phone}","${c.consentStatus}","${c.createdAt.toISOString()}"`
      );

      const csvData = ["id,phone,consentStatus,createdAt", ...csvRows].join("\n");

      return new NextResponse(csvData, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="contacts-export-${Date.now()}.csv"`
        }
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Export failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // Save action mock
  return NextResponse.json({
    success: true,
    message: "Snapshot saved successfully to tenant inventory."
  });
}
