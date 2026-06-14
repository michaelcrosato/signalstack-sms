import { z } from "zod";

const messageSchema = z.object({
  direction: z.string().trim().min(1).max(32),
  body: z.string().trim().min(1).max(1600)
});

export const campaignCopyRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  businessName: z.string().trim().min(1).max(160).optional(),
  tone: z.string().trim().min(1).max(80).optional()
});

export const conversationAiRequestSchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
  messages: z.array(messageSchema).default([]),
  goal: z.string().trim().min(1).max(500).optional()
}).refine((input) => input.conversationId || input.messages.length > 0, {
  message: "conversationId or messages are required."
});

export type CampaignCopyRequest = z.infer<typeof campaignCopyRequestSchema>;
export type ConversationAiRequest = z.infer<typeof conversationAiRequestSchema>;
