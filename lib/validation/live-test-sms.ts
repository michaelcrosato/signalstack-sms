import { z } from "zod";

export const liveTestSmsSchema = z.object({
  requestId: z.string().trim().uuid(),
  to: z.string().trim().min(5).max(32),
  body: z.string().trim().min(1).max(320),
  confirmation: z.string().trim().min(1).max(80),
  operatorToken: z.string().min(32).max(256)
});

export type LiveTestSmsInput = z.infer<typeof liveTestSmsSchema>;
