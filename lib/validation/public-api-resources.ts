import { ConsentStatus } from "@prisma/client";
import { z } from "zod";
import { contactCreateSchema, contactUpdateSchema } from "@/lib/validation/contacts";
import { templateCreateSchema } from "@/lib/validation/campaigns";

const boundedIdentifierSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

const nullableShortTextSchema = z.string().trim().min(1).max(500).nullable();
const publicLabelNameSchema = z.string().trim().min(1).max(120);
const publicLabelNamesSchema = z.array(publicLabelNameSchema).max(100);
const publicTemplateVariablesSchema = z.array(z.string().trim().min(1).max(80)).max(100);
export const publicMessageMediaUrlsSchema = z
  .array(
    z
      .string()
      .max(2_048)
      .url()
      .refine(
        (value) => normalizeHttpsMediaUrl(value) !== null,
        "Media URLs must use HTTPS without embedded credentials."
      )
  )
  .max(10)
  .superRefine((values, context) => {
    const normalized = values.map(normalizeHttpsMediaUrl);
    if (
      normalized.every((value): value is string => value !== null) &&
      new Set(normalized).size !== values.length
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Media URLs must be unique." });
    }
  });

function normalizeHttpsMediaUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export const publicApiResourceIdSchema = boundedIdentifierSchema;

export const publicApiCollectionQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default("50"),
    cursor: z.string().min(1).max(1_024).optional()
  })
  .strict();

export const publicContactCreateSchema = contactCreateSchema
  .extend({
    tagNames: publicLabelNamesSchema.default([]),
    listNames: publicLabelNamesSchema.default([])
  })
  .strict();
export const publicContactUpdateSchema = contactUpdateSchema
  .extend({
    tagNames: publicLabelNamesSchema.optional(),
    listNames: publicLabelNamesSchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one contact field is required.");

export const publicTagCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional()
  })
  .strict();
export const publicTagUpdateSchema = publicTagCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one tag field is required.");

export const publicListCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: nullableShortTextSchema.optional()
  })
  .strict();
export const publicListUpdateSchema = publicListCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one list field is required.");

export const publicListMembershipCreateSchema = z
  .object({
    contactIds: z.array(boundedIdentifierSchema).min(1).max(100)
  })
  .strict()
  .refine((value) => new Set(value.contactIds).size === value.contactIds.length, {
    message: "contactIds must not contain duplicates.",
    path: ["contactIds"]
  });

export const publicSegmentDefinitionSchema = z
  .object({
    tagNames: publicLabelNamesSchema.default([]),
    consentStatuses: z.array(z.nativeEnum(ConsentStatus)).max(10).default([]),
    minLeadScore: z.number().int().min(0).max(100).optional(),
    maxLeadScore: z.number().int().min(0).max(100).optional()
  })
  .strict()
  .refine(
    (value) =>
      value.minLeadScore === undefined ||
      value.maxLeadScore === undefined ||
      value.minLeadScore <= value.maxLeadScore,
    { message: "minLeadScore cannot exceed maxLeadScore.", path: ["minLeadScore"] }
  );

export const publicSegmentCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: nullableShortTextSchema.optional(),
    definition: publicSegmentDefinitionSchema
  })
  .strict();
export const publicSegmentUpdateSchema = publicSegmentCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one segment field is required.");

export const publicTemplateCreateSchema = templateCreateSchema
  .extend({ variables: publicTemplateVariablesSchema.default([]) })
  .strict();
export const publicTemplateUpdateSchema = templateCreateSchema
  .extend({ variables: publicTemplateVariablesSchema.default([]) })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one template field is required.");

export const publicMessageCreateSchema = z
  .object({
    contactId: boundedIdentifierSchema,
    conversationId: boundedIdentifierSchema.optional(),
    body: z.string().trim().min(1).max(1_600),
    mediaUrls: publicMessageMediaUrlsSchema.default([])
  })
  .strict();
