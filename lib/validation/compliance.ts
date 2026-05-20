import { A2pRegistrationStatus } from "@prisma/client";
import { z } from "zod";

const optionalUrl = z.string().trim().url().max(2048).optional();
const optionalText = z.string().trim().min(1).max(1000).optional();
const optionalShortText = z.string().trim().min(1).max(160).optional();

export const complianceProfileUpdateSchema = z.object({
  businessName: optionalShortText,
  messagingUseCase: optionalText,
  optInDescription: optionalText,
  privacyPolicyUrl: optionalUrl,
  termsOfServiceUrl: optionalUrl,
  a2pRegistrationStatus: z.nativeEnum(A2pRegistrationStatus).optional()
});

export type ComplianceProfileUpdateInput = z.infer<typeof complianceProfileUpdateSchema>;
