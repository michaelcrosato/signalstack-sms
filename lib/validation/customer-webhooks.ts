import { z } from "zod";
import { CUSTOMER_WEBHOOK_EVENT_TYPES } from "@/lib/integrations/customer-webhooks/catalog";

const eventTypeSchema = z.enum(CUSTOMER_WEBHOOK_EVENT_TYPES);

export const customerWebhookEndpointCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().min(1).max(2_048),
  eventTypes: z.array(eventTypeSchema).min(1).max(CUSTOMER_WEBHOOK_EVENT_TYPES.length)
}).strict();

export const customerWebhookEndpointUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    eventTypes: z.array(eventTypeSchema).min(1).max(CUSTOMER_WEBHOOK_EVENT_TYPES.length).optional(),
    enabled: z.boolean().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one endpoint change is required.");

export const customerWebhookIdentifierSchema = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim(), "Identifier must be canonical.");
