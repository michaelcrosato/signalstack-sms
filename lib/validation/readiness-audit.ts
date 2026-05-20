import { z } from "zod";

export const readinessAuditQuerySchema = z.object({
  action: z.string().trim().regex(/^[A-Z0-9_]{1,80}$/).optional(),
  subjectType: z.string().trim().regex(/^[A-Za-z0-9_]{1,80}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type ReadinessAuditQuery = z.infer<typeof readinessAuditQuerySchema>;
