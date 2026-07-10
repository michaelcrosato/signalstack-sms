import type { Prisma } from "@prisma/client";
import { escapeCsv } from "@/lib/csv/escape";

export type ReadinessAuditExportEvent = {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  actorUserId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

const readinessAuditCsvColumns = ["id", "action", "subjectType", "subjectId", "actorUserId", "createdAt", "metadata"];

export function serializeReadinessAuditEventsCsv(events: ReadinessAuditExportEvent[]) {
  const rows = events.map((event) =>
    [
      event.id,
      event.action,
      event.subjectType,
      event.subjectId,
      event.actorUserId,
      event.createdAt.toISOString(),
      event.metadata ? JSON.stringify(event.metadata) : ""
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [readinessAuditCsvColumns.join(","), ...rows].join("\n");
}
