import { ConsentStatus } from "@prisma/client";
import { z } from "zod";

const phoneSchema = z.string().trim().min(7).max(32);
const optionalText = z.string().trim().min(1).max(500).optional();
const optionalShortText = z.string().trim().min(1).max(120).optional();

export const contactCreateSchema = z.object({
  phone: phoneSchema,
  email: z.string().trim().email().max(254).optional(),
  firstName: optionalShortText,
  lastName: optionalShortText,
  displayName: optionalShortText,
  consentStatus: z.nativeEnum(ConsentStatus).default(ConsentStatus.UNKNOWN),
  optInSource: optionalShortText,
  source: optionalShortText,
  notes: optionalText,
  tagNames: z.array(z.string().trim().min(1).max(120)).default([]),
  listNames: z.array(z.string().trim().min(1).max(120)).default([])
});

export const contactUpdateSchema = contactCreateSchema.partial().extend({
  archived: z.boolean().optional()
});

export const contactImportRequestSchema = z.object({
  filename: z.string().trim().max(255).optional(),
  csv: z.string().min(1).max(1_000_000)
});

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type ContactImportRequest = z.infer<typeof contactImportRequestSchema>;
