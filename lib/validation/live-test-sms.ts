import { z } from "zod";

export const liveTestSmsSchema = z.object({
  to: z.string().trim().min(5).max(32),
  body: z.string().trim().min(1).max(320),
  confirmation: z.string().trim().min(1).max(80)
});

export type LiveTestSmsInput = z.infer<typeof liveTestSmsSchema>;
