import { MessageApplicationStatus, MessageAttemptStatus } from "@prisma/client";
import { z } from "zod";

const boundedIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const deliveryAttemptReviewQuerySchema = z
  .object({
    applicationStatus: z.nativeEnum(MessageApplicationStatus).optional(),
    attemptStatus: z.nativeEnum(MessageAttemptStatus).optional(),
    requiresReview: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    cursor: boundedIdentifierSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

export const deliveryAttemptAttestationSchema = z
  .object({
    confirmation: z.literal("ATTEST NOT SENT"),
    reason: z.string().trim().min(10).max(500)
  })
  .strict();

export const deliveryAttemptRetrySchema = z
  .object({ confirmation: z.literal("RETRY MESSAGE") })
  .strict();

export const deliveryAttemptIdSchema = boundedIdentifierSchema;

export type DeliveryAttemptReviewQuery = z.infer<typeof deliveryAttemptReviewQuerySchema>;
