import { z } from "zod";

export const twilioWebhookPayloadSchema = z
  .object({
    AccountSid: z.string().optional(),
    ApiVersion: z.string().optional(),
    Body: z.string().optional(),
    ErrorCode: z.string().optional(),
    ErrorMessage: z.string().optional(),
    From: z.string().optional(),
    MessageSid: z.string().optional(),
    MessageStatus: z.string().optional(),
    SmsSid: z.string().optional(),
    SmsStatus: z.string().optional(),
    To: z.string().optional()
  })
  .passthrough();

export type TwilioWebhookPayload = z.infer<typeof twilioWebhookPayloadSchema>;
