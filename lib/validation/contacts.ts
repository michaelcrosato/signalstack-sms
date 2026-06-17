import { ConsentStatus } from "@prisma/client";
import { z } from "zod";

const phoneSchema = z.string().trim().min(7).max(32);
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  z.string().trim().min(1).max(500).nullable().optional()
);
const optionalShortText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  z.string().trim().min(1).max(120).nullable().optional()
);

export const contactCreateSchema = z.object({
  phone: phoneSchema,
  email: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    z.string().trim().email().max(254).nullable().optional()
  ),
  firstName: optionalShortText,
  lastName: optionalShortText,
  displayName: optionalShortText,
  consentStatus: z.nativeEnum(ConsentStatus).default(ConsentStatus.UNKNOWN),
  optInSource: optionalShortText,
  consentCapturedAt: z.coerce.date().nullable().optional(),
  consentMethod: z.string().trim().min(1).max(120).nullable().optional(),
  consentDisclosure: z.string().trim().min(1).max(500).nullable().optional(),
  source: optionalShortText,
  notes: optionalText,
  tagNames: z.array(z.string().trim().min(1).max(120)).default([]),
  listNames: z.array(z.string().trim().min(1).max(120)).default([])
});

export const contactUpdateSchema = contactCreateSchema.partial().extend({
  archived: z.boolean().optional()
});

export const contactMergeSchema = z.object({
  sourceContactId: z.string().trim().min(1).max(120)
});

export const contactImportRequestSchema = z.object({
  filename: z.string().trim().max(255).optional(),
  csv: z.string().min(1).max(1_000_000)
});

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type ContactMergeInput = z.infer<typeof contactMergeSchema>;
export type ContactImportRequest = z.infer<typeof contactImportRequestSchema>;
