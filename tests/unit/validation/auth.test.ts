import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  authLoginSchema,
  authSetupSchema,
  inviteAcceptSchema,
  isSafeLocalRedirect,
  organizationCreateSchema,
  passwordResetCompleteSchema,
  sessionOrganizationSelectSchema,
  teamInviteCreateSchema,
  teamMemberRoleUpdateSchema,
  teamMemberStatusUpdateSchema
} from "@/lib/validation/auth";

describe("auth boundary validation", () => {
  it("normalizes a valid first-owner setup request", () => {
    const parsed = authSetupSchema.parse({
      bootstrapToken: "ss_bootstrap_abcdefghijklmnopqrstuvwxyz0123456789",
      email: " Owner@Example.COM ",
      displayName: " Owner ",
      password: "correct horse battery staple",
      organizationName: " Example Company ",
      organizationSlug: "example-company",
      timezone: "America/Vancouver"
    });

    expect(parsed).toMatchObject({
      email: "owner@example.com",
      displayName: "Owner",
      organizationName: "Example Company",
      organizationSlug: "example-company",
      timezone: "America/Vancouver"
    });
  });

  it("rejects unsafe setup boundaries", () => {
    expect(
      authSetupSchema.safeParse({
        bootstrapToken: "short",
        email: "not-an-email",
        displayName: "",
        password: "short",
        organizationName: "Example",
        organizationSlug: "Example Company",
        timezone: "Mars/Olympus"
      }).success
    ).toBe(false);
  });

  it("accepts login with a local redirect and applies the dashboard default", () => {
    expect(
      authLoginSchema.parse({ email: "MEMBER@example.com", password: "a secure password value" })
    ).toMatchObject({ email: "member@example.com", redirectTo: "/dashboard" });
    expect(
      authLoginSchema.parse({
        email: "member@example.com",
        password: "a secure password value",
        redirectTo: "/dashboard/inbox?filter=open"
      }).redirectTo
    ).toBe("/dashboard/inbox?filter=open");
  });

  it("rejects external, protocol-relative, backslash, and control-character redirects", () => {
    for (const value of [
      "https://example.com",
      "//example.com/path",
      "/\\example.com",
      "/dashboard\nnext"
    ]) {
      expect(isSafeLocalRedirect(value)).toBe(false);
      expect(
        authLoginSchema.safeParse({
          email: "member@example.com",
          password: "a secure password value",
          redirectTo: value
        }).success
      ).toBe(false);
    }
  });

  it("validates organization creation and selection", () => {
    expect(
      organizationCreateSchema.parse({ name: "Second Org", slug: "second-org" })
    ).toEqual({ name: "Second Org", slug: "second-org", timezone: "America/Los_Angeles" });
    expect(sessionOrganizationSelectSchema.parse({ organizationId: "org_123" })).toEqual({
      organizationId: "org_123"
    });
  });

  it("validates bounded team invitations and roles", () => {
    expect(
      teamInviteCreateSchema.parse({ email: "agent@example.com" })
    ).toEqual({ email: "agent@example.com", role: MembershipRole.MEMBER, expiresInHours: 72 });
    expect(
      teamInviteCreateSchema.safeParse({
        email: "agent@example.com",
        role: MembershipRole.ADMIN,
        expiresInHours: 24 * 31
      }).success
    ).toBe(false);
    expect(teamMemberRoleUpdateSchema.parse({ role: MembershipRole.OWNER })).toEqual({
      role: MembershipRole.OWNER
    });
    expect(teamMemberStatusUpdateSchema.parse({ suspended: true })).toEqual({ suspended: true });
  });

  it("accepts exactly signed-in, new-account, or existing-account invite proof", () => {
    const token = "ss_invite_abcdefghijklmnopqrstuvwxyz0123456789";
    expect(inviteAcceptSchema.parse({ token })).toEqual({ token });
    expect(
      inviteAcceptSchema.parse({
        token,
        displayName: "New Agent",
        password: "a secure password value"
      })
    ).toMatchObject({ displayName: "New Agent" });
    expect(
      inviteAcceptSchema.parse({
        token,
        email: "  EXISTING@EXAMPLE.TEST ",
        password: "a secure password value"
      })
    ).toEqual({ token, email: "existing@example.test", password: "a secure password value" });
    expect(inviteAcceptSchema.safeParse({ token, password: "a secure password value" }).success).toBe(false);
    expect(
      inviteAcceptSchema.safeParse({
        token,
        email: "existing@example.test",
        displayName: "Ambiguous Agent",
        password: "a secure password value"
      }).success
    ).toBe(false);
  });

  it("validates password-reset token and replacement password bounds", () => {
    const token = "ss_reset_abcdefghijklmnopqrstuvwxyz0123456789";
    expect(
      passwordResetCompleteSchema.parse({ token, password: "a secure password value" })
    ).toEqual({ token, password: "a secure password value" });
    expect(passwordResetCompleteSchema.safeParse({ token, password: "short" }).success).toBe(false);
  });
});
