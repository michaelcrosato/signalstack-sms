import { z } from "zod";

export const scheduledCampaignJobSchema = z.object({
  version: z.literal(1),
  orgId: z.string().min(1),
  campaignId: z.string().min(1),
  scheduledAt: z.string().datetime()
});

export const scheduledCampaignBullMqJobDataSchema = scheduledCampaignJobSchema.extend({
  queueJobId: z.string().min(1)
});

export type ScheduledCampaignJob = z.infer<typeof scheduledCampaignJobSchema>;
export type ScheduledCampaignBullMqJobData = z.infer<typeof scheduledCampaignBullMqJobDataSchema>;
