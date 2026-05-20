import { z } from "zod";

const idSchema = z.string().trim().min(1);
const phoneSchema = z.string().trim().min(7).max(32);
const bodySchema = z.string().trim().min(1).max(1600);

export const inboundMessageSchema = z.object({
  phone: phoneSchema,
  body: bodySchema,
  providerMessageId: z.string().trim().min(1).max(255).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

export const conversationMessageCreateSchema = z.object({
  body: bodySchema,
  providerMessageId: z.string().trim().min(1).max(255).optional(),
  idempotencyKey: z.string().trim().min(1).max(255).optional()
});

export const conversationAssignSchema = z.object({
  assignedToUserId: idSchema.nullable().optional()
});

export const conversationNoteCreateSchema = z.object({
  body: bodySchema
});

export const conversationResolveSchema = z.object({
  resolved: z.boolean().default(true)
});

export type InboundMessageInput = z.infer<typeof inboundMessageSchema>;
export type ConversationMessageCreateInput = z.infer<typeof conversationMessageCreateSchema>;
export type ConversationAssignInput = z.infer<typeof conversationAssignSchema>;
export type ConversationNoteCreateInput = z.infer<typeof conversationNoteCreateSchema>;
export type ConversationResolveInput = z.infer<typeof conversationResolveSchema>;
