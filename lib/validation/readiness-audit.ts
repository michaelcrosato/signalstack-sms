import { z } from "zod";
import {
  allowedReadinessAuditOperationActions,
  allowedReadinessAuditOperationExportLimits,
  allowedReadinessAuditOperationSubjectTypes
} from "@/lib/operations/readiness-audit-operations";

export const readinessAuditQueryLimitMax = Math.max(...allowedReadinessAuditOperationExportLimits);

export const readinessAuditQuerySchema = z.object({
  action: z.enum(allowedReadinessAuditOperationActions).optional(),
  subjectType: z.enum(allowedReadinessAuditOperationSubjectTypes).optional(),
  limit: z.coerce.number().int().min(1).max(readinessAuditQueryLimitMax).default(50)
});

export type ReadinessAuditQuery = z.infer<typeof readinessAuditQuerySchema>;
