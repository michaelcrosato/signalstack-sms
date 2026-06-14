import { z } from "zod";

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1600),
  variables: z.array(z.string().trim().min(1).max(80)).default([])
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1600),
  templateId: z.string().trim().min(1).optional(),
  contactIds: z.array(z.string().trim().min(1)).default([])
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export const campaignPreflightSchema = z.object({
  contactIds: z.array(z.string().trim().min(1)).optional()
});

export const campaignScheduleSchema = z.object({
  scheduledAt: z.string().datetime()
});

export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;
export type CampaignPreflightInput = z.infer<typeof campaignPreflightSchema>;
export type CampaignScheduleInput = z.infer<typeof campaignScheduleSchema>;
