import { z } from "zod";
import { publicApiResourceIdSchema } from "@/lib/validation/public-api-resources";

const publicCampaignNameSchema = z.string().trim().min(1).max(120);
const publicMessageBodySchema = z.string().trim().min(1).max(1_600);
const publicCampaignContactIdsSchema = z
  .array(publicApiResourceIdSchema)
  .max(10_000)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Campaign contact IDs must be unique." });
    }
  });

export const publicCampaignCreateSchema = z
  .object({
    name: publicCampaignNameSchema,
    body: publicMessageBodySchema,
    templateId: publicApiResourceIdSchema.optional(),
    contactIds: publicCampaignContactIdsSchema.default([])
  })
  .strict();

export const publicCampaignUpdateSchema = publicCampaignCreateSchema
  .omit({ contactIds: true })
  .extend({ contactIds: publicCampaignContactIdsSchema.optional() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one campaign field is required.");

export const publicCampaignScheduleSchema = z
  .object({ scheduledAt: z.string().datetime() })
  .strict();

export const publicConversationReplySchema = z
  .object({ body: publicMessageBodySchema })
  .strict();

export type PublicCampaignCreateInput = z.infer<typeof publicCampaignCreateSchema>;
export type PublicCampaignUpdateInput = z.infer<typeof publicCampaignUpdateSchema>;
