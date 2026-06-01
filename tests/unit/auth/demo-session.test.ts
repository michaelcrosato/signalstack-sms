import { describe, expect, it } from "vitest";
import { MembershipRole } from "@prisma/client";
import { demoSession, getDemoSession } from "@/lib/auth/demo-session";

describe("demo-session", () => {
  describe("getDemoSession", () => {
    it("returns the demo session object", () => {
      const session = getDemoSession();
      expect(session).toBe(demoSession);
    });
  });

  describe("demoSession", () => {
    it("has the expected properties and values", () => {
      expect(demoSession).toEqual({
        clerkUserId: "demo_user_signalstack",
        email: "owner@signalstack.example",
        displayName: "Demo Owner",
        orgSlug: "demo-signalstack",
        orgName: "SignalStack Demo Co",
        role: MembershipRole.OWNER,
      });
    });
  });
});
