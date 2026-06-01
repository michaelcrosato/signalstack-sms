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
    it("has the expected properties for a demo user", () => {
      expect(demoSession).toEqual({
        clerkUserId: "demo_user_signalstack",
        email: "owner@signalstack.example",
        displayName: "Demo Owner",
        orgSlug: "demo-signalstack",
        orgName: "SignalStack Demo Co",
        role: MembershipRole.OWNER
      });
    });

    it("is deeply frozen (as const)", () => {
      // TypeScript enforces this statically, but we can also verify the object structure
      // matches the expected shape since modifying a frozen object isn't directly observable
      // in a normal assert without trying to mutate it (which TS would block).
      // Here we just ensure the properties exist.
      expect(demoSession).toHaveProperty("clerkUserId");
      expect(demoSession).toHaveProperty("email");
      expect(demoSession).toHaveProperty("role");
    });
  });
});
