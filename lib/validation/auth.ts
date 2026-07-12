import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import {
  AUTH_TOKEN_MAX_CHARACTERS,
  AUTH_TOKEN_MIN_CHARACTERS,
  AUTH_TOKEN_PATTERN
} from "@/lib/auth/auth-token-policy";

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(128);
const displayNameSchema = z.string().trim().min(1).max(120);
const organizationNameSchema = z.string().trim().min(1).max(160);
const organizationSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens.");
const opaqueAuthTokenSchema = z
  .string()
  .min(AUTH_TOKEN_MIN_CHARACTERS)
  .max(AUTH_TOKEN_MAX_CHARACTERS)
  .regex(AUTH_TOKEN_PATTERN);
const localRedirectSchema = z
  .string()
  .trim()
  .max(512)
  .refine(isSafeLocalRedirect, "Redirect must be a local application path.");
const timezoneSchema = z.string().trim().min(1).max(100).refine(isIanaTimezone, "Timezone must be a valid IANA identifier.");

export const authSetupSchema = z
  .object({
    bootstrapToken: opaqueAuthTokenSchema,
    email: emailSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    organizationName: organizationNameSchema,
    organizationSlug: organizationSlugSchema,
    timezone: timezoneSchema.default("America/Los_Angeles")
  })
  .strict();

export const authLoginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    redirectTo: localRedirectSchema.default("/dashboard")
  })
  .strict();

export const organizationCreateSchema = z
  .object({
    name: organizationNameSchema,
    slug: organizationSlugSchema,
    timezone: timezoneSchema.default("America/Los_Angeles")
  })
  .strict();

export const sessionOrganizationSelectSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(128)
  })
  .strict();

export const teamInviteCreateSchema = z
  .object({
    email: emailSchema,
    role: z.nativeEnum(MembershipRole).default(MembershipRole.MEMBER),
    expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72)
  })
  .strict();

export const teamMemberRoleUpdateSchema = z
  .object({
    role: z.nativeEnum(MembershipRole)
  })
  .strict();

export const teamMemberStatusUpdateSchema = z
  .object({
    suspended: z.boolean()
  })
  .strict();

export const inviteAcceptSchema = z.union([
  z.object({ token: opaqueAuthTokenSchema }).strict(),
  z
    .object({
      token: opaqueAuthTokenSchema,
      displayName: displayNameSchema,
      password: passwordSchema
    })
    .strict(),
  z
    .object({
      token: opaqueAuthTokenSchema,
      email: emailSchema,
      password: passwordSchema
    })
    .strict()
]);

export const passwordResetCompleteSchema = z
  .object({
    token: opaqueAuthTokenSchema,
    password: passwordSchema
  })
  .strict();

export type AuthSetupInput = z.infer<typeof authSetupSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type SessionOrganizationSelectInput = z.infer<typeof sessionOrganizationSelectSchema>;
export type TeamInviteCreateInput = z.infer<typeof teamInviteCreateSchema>;
export type TeamMemberRoleUpdateInput = z.infer<typeof teamMemberRoleUpdateSchema>;
export type TeamMemberStatusUpdateInput = z.infer<typeof teamMemberStatusUpdateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type PasswordResetCompleteInput = z.infer<typeof passwordResetCompleteSchema>;

export function isSafeLocalRedirect(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32)
  );
}

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
