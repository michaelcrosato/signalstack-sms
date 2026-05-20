import { z } from "zod";

export const providerPhoneNumberSchema = z.object({
  phoneNumber: z.string().trim().min(5).max(32).regex(/^\+[1-9]\d{4,31}$/),
  label: z.string().trim().min(1).max(80).optional(),
  provider: z.enum(["dummy", "twilio"]).default("dummy"),
  capabilities: z.array(z.enum(["sms", "mms"])).min(1).default(["sms"]),
  isDefault: z.boolean().default(false)
});

export type ProviderPhoneNumberInput = z.infer<typeof providerPhoneNumberSchema>;

export const providerSettingsUpdateSchema = z.object({
  provider: z.literal("twilio"),
  twilio: z.object({
    accountSid: z.string().trim().min(8).max(80),
    authToken: z.string().trim().min(8).max(160),
    fromNumber: z.string().trim().min(5).max(32).regex(/^\+[1-9]\d{4,31}$/)
  })
});

export type ProviderSettingsUpdateInput = z.infer<typeof providerSettingsUpdateSchema>;
