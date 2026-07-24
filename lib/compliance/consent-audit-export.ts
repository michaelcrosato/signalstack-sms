import type { AuditEvent, ConsentEvent } from "@prisma/client";
import { escapeCsvCell } from "@/lib/csv/escape";

const consentCsvHeaders = [
  "id",
  "orgId",
  "contactId",
  "phone",
  "consentStatus",
  "previousStatus",
  "source",
  "sourceIp",
  "channel",
  "actorUserId",
  "consentCapturedAt",
  "consentMethod",
  "consentDisclosure",
  "evidenceReference",
  "createdAt"
];

export function serializeConsentEventsCsv(events: ConsentEvent[]): string {
  const rows = events.map((event) =>
    [
      event.id,
      event.orgId,
      event.contactId ?? "",
      event.phone,
      event.consentStatus,
      event.previousStatus ?? "",
      event.source,
      event.sourceIp ?? "",
      event.channel ?? "",
      event.actorUserId ?? "",
      event.consentCapturedAt ? event.consentCapturedAt.toISOString() : "",
      event.consentMethod ?? "",
      event.consentDisclosure ?? "",
      event.evidenceReference ?? "",
      event.createdAt.toISOString()
    ]
      .map((val) => escapeCsvCell(val, { alwaysQuote: true }))
      .join(",")
  );

  return [consentCsvHeaders.join(","), ...rows].join("\n");
}

const auditCsvHeaders = [
  "id",
  "orgId",
  "actorUserId",
  "apiCredentialId",
  "action",
  "subjectType",
  "subjectId",
  "sourceIp",
  "channel",
  "createdAt",
  "metadata"
];

export function serializeAuditEventsCsv(events: AuditEvent[]): string {
  const rows = events.map((event) =>
    [
      event.id,
      event.orgId,
      event.actorUserId ?? "",
      event.apiCredentialId ?? "",
      event.action,
      event.subjectType,
      event.subjectId ?? "",
      event.sourceIp ?? "",
      event.channel ?? "",
      event.createdAt.toISOString(),
      event.metadata ? JSON.stringify(event.metadata) : ""
    ]
      .map((val) => escapeCsvCell(val, { alwaysQuote: true }))
      .join(",")
  );

  return [auditCsvHeaders.join(","), ...rows].join("\n");
}
