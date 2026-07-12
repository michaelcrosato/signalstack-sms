import { z } from "zod";

export const e164PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{4,14}$/, "Phone number must be canonical E.164.");

export const twilioAccountSidSchema = z.string().regex(/^AC[a-fA-F0-9]{32}$/);
export const twilioMessagingServiceSidSchema = z.string().regex(/^MG[a-fA-F0-9]{32}$/);
export const twilioPhoneNumberSidSchema = z.string().regex(/^PN[a-fA-F0-9]{32}$/);
export const twilioMessageSidSchema = z.string().regex(/^(?:SM|MM)[a-fA-F0-9]{32}$/);
export const twilioAuthTokenSchema = z.string().regex(/^[a-fA-F0-9]{32}$/);

export const twilioProviderCredentialsSchema = z.object({
  accountSid: twilioAccountSidSchema,
  authToken: twilioAuthTokenSchema
});

const providerHttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", "Provider URLs must use HTTPS.");

export const providerMessageCreateSchema = z
  .object({
    orgId: z.string().trim().min(1).max(191),
    to: e164PhoneNumberSchema,
    from: e164PhoneNumberSchema.optional(),
    messagingServiceId: twilioMessagingServiceSidSchema.optional(),
    body: z.string().min(1).max(1600).optional(),
    mediaUrls: z.array(providerHttpsUrlSchema).max(10).default([]),
    statusCallbackUrl: providerHttpsUrlSchema.optional(),
    idempotencyKey: z.string().trim().min(1).max(191)
  })
  .superRefine((value, context) => {
    if (Boolean(value.from) === Boolean(value.messagingServiceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one sender number or messaging service is required.",
        path: ["from"]
      });
    }
    if (!value.body && value.mediaUrls.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A message body or media URL is required.",
        path: ["body"]
      });
    }
  });

export const twilioAccountApiResponseSchema = z
  .object({
    sid: twilioAccountSidSchema,
    friendly_name: z.string().max(512).nullable().optional(),
    status: z.string().trim().min(1).max(64)
  })
  .passthrough();

export const twilioMessageApiResponseSchema = z
  .object({
    sid: twilioMessageSidSchema,
    account_sid: twilioAccountSidSchema,
    status: z.string().trim().min(1).max(64),
    to: e164PhoneNumberSchema,
    from: e164PhoneNumberSchema.nullable().optional(),
    messaging_service_sid: twilioMessagingServiceSidSchema.nullable().optional(),
    error_code: z.union([z.number().int(), z.string().regex(/^\d+$/)]).nullable().optional(),
    date_created: z.string().max(128).nullable().optional(),
    date_sent: z.string().max(128).nullable().optional()
  })
  .passthrough();

export const twilioPhoneNumberApiResponseSchema = z
  .object({
    sid: twilioPhoneNumberSidSchema,
    account_sid: twilioAccountSidSchema,
    phone_number: e164PhoneNumberSchema,
    friendly_name: z.string().max(512).nullable().optional(),
    capabilities: z.object({
      sms: z.boolean(),
      mms: z.boolean()
    }).passthrough()
  })
  .passthrough();

export const twilioPhoneNumberListApiResponseSchema = z
  .object({
    incoming_phone_numbers: z.array(twilioPhoneNumberApiResponseSchema).max(100)
  })
  .passthrough();

export const twilioMessagingServiceApiResponseSchema = z
  .object({
    sid: twilioMessagingServiceSidSchema,
    account_sid: twilioAccountSidSchema,
    friendly_name: z.string().max(512).nullable().optional()
  })
  .passthrough();

export const twilioMessagingServiceListApiResponseSchema = z
  .object({
    services: z.array(twilioMessagingServiceApiResponseSchema).max(100)
  })
  .passthrough();

export const twilioErrorApiResponseSchema = z
  .object({
    code: z.number().int().optional(),
    sid: twilioMessageSidSchema.optional()
  })
  .passthrough();

export const providerPhoneNumberSchema = z.object({
  phoneNumber: e164PhoneNumberSchema,
  label: z.string().trim().min(1).max(80).optional(),
  provider: z.literal("dummy").default("dummy"),
  capabilities: z.array(z.enum(["sms", "mms"])).min(1).default(["sms"]),
  isDefault: z.boolean().default(false)
}).strict();

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

export const providerAccountConnectSchema = z
  .object({
    provider: z.literal("twilio"),
    externalAccountId: twilioAccountSidSchema,
    authToken: twilioAuthTokenSchema,
    isDefault: z.boolean().default(true)
  })
  .strict();

export const providerCredentialRotateSchema = z
  .object({ authToken: twilioAuthTokenSchema })
  .strict();

export const providerAccountUpdateSchema = z
  .object({ isDefault: z.literal(true) })
  .strict();

const providerDiscoveryCandidateSchema = z
  .string()
  .regex(/^pvcandidate_v1_[A-Za-z0-9_-]{43}$/);

export const providerResourceImportSchema = z
  .object({
    credentialVersion: z.number().int().min(1),
    phoneNumberCandidateIds: z.array(providerDiscoveryCandidateSchema).max(100).default([]),
    messagingServiceCandidateIds: z.array(providerDiscoveryCandidateSchema).max(100).default([]),
    defaultPhoneNumberCandidateId: providerDiscoveryCandidateSchema.optional(),
    defaultMessagingServiceCandidateId: providerDiscoveryCandidateSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.phoneNumberCandidateIds.length + value.messagingServiceCandidateIds.length < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one discovered provider resource is required."
      });
    }
    if (new Set(value.phoneNumberCandidateIds).size !== value.phoneNumberCandidateIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider number candidates must be unique.",
        path: ["phoneNumberCandidateIds"]
      });
    }
    if (
      new Set(value.messagingServiceCandidateIds).size !==
      value.messagingServiceCandidateIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider service candidates must be unique.",
        path: ["messagingServiceCandidateIds"]
      });
    }
    if (
      value.defaultPhoneNumberCandidateId &&
      !value.phoneNumberCandidateIds.includes(value.defaultPhoneNumberCandidateId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The default number must be selected for import.",
        path: ["defaultPhoneNumberCandidateId"]
      });
    }
    if (
      value.defaultMessagingServiceCandidateId &&
      !value.messagingServiceCandidateIds.includes(value.defaultMessagingServiceCandidateId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The default service must be selected for import.",
        path: ["defaultMessagingServiceCandidateId"]
      });
    }
  });

export const providerResourceLifecycleSchema = z
  .object({
    makeDefault: z.boolean().optional(),
    disable: z.boolean().optional()
  })
  .strict()
  .superRefine((value, context) => {
    const actions = Number(value.makeDefault === true) + Number(value.disable === true);
    if (actions !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select exactly one provider lifecycle action."
      });
    }
  });

export type ProviderAccountConnectInput = z.infer<typeof providerAccountConnectSchema>;
export type ProviderResourceImportInput = z.infer<typeof providerResourceImportSchema>;

export const providerCredentialRotationActionSchema = z.enum(["CONFIGURED", "REFRESHED", "ROTATED", "DELETED"]);

export const providerCredentialRotationQuerySchema = z.object({
  action: providerCredentialRotationActionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export type ProviderCredentialRotationAction = z.infer<typeof providerCredentialRotationActionSchema>;
export type ProviderCredentialRotationQuery = z.infer<typeof providerCredentialRotationQuerySchema>;
