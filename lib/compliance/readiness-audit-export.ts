import type { Prisma } from "@prisma/client";

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

function csvCell(value: string | null | undefined) {
  let normalized = value ?? "";
  if (/^[=+\-@\t\r]/.test(normalized)) {
    normalized = "'" + normalized;
  }
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

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
      .map(csvCell)
      .join(",")
  );

  return [readinessAuditCsvColumns.join(","), ...rows].join("\n");
}
