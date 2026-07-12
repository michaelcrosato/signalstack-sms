import { z } from "zod";
import { API_SCOPES } from "@/lib/public-api/scopes";

const apiScopeSchema = z.enum(API_SCOPES);

export const apiCredentialCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiScopeSchema).min(1).max(API_SCOPES.length),
  rateLimitPerMinute: z.number().int().min(1).max(10_000).default(60),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((value) => value.getTime() > Date.now(), "Expiry must be in the future.")
    .nullable()
    .optional()
});

export const apiCredentialIdSchema = z.string().trim().min(1).max(191);

export type ApiCredentialCreateInput = z.infer<typeof apiCredentialCreateSchema>;
