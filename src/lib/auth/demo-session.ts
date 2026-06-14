import { MembershipRole } from "@prisma/client";

export const demoSession = {
  clerkUserId: "demo_user_signalstack",
  email: "owner@signalstack.example",
  displayName: "Demo Owner",
  orgSlug: "demo-signalstack",
  orgName: "SignalStack Demo Co",
  role: MembershipRole.OWNER
} as const;

export type DemoSession = typeof demoSession;

export function getDemoSession(): DemoSession {
  return demoSession;
}

