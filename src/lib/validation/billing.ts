import { UsageEventType } from "@prisma/client";
import { z } from "zod";

export const usageEventCreateSchema = z.object({
  type: z.nativeEnum(UsageEventType),
  quantity: z.number().int().positive().max(100_000).default(1),
  metadata: z.record(z.unknown()).optional()
});

export type UsageEventCreateInput = z.infer<typeof usageEventCreateSchema>;
