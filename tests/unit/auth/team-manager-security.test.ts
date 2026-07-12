import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("team invite bearer UI", () => {
  it("clears stale output, binds the visible target, and copies only after an explicit action", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app", "team", "team-manager.tsx"),
      "utf8"
    );
    const inviteStart = source.indexOf("async function invite(");
    const explicitCopyStart = source.indexOf("async function copyCreatedInvite(");
    expect(inviteStart).toBeGreaterThanOrEqual(0);
    expect(explicitCopyStart).toBeGreaterThan(inviteStart);

    const inviteHandler = source.slice(inviteStart, explicitCopyStart);
    expect(inviteHandler).toContain("setCreatedInvite(null)");
    expect(inviteHandler).not.toContain("clipboard.writeText");
    expect(source.slice(explicitCopyStart)).toContain("navigator.clipboard.writeText");
    expect(source).toContain("Target: {createdInvite.email} · {createdInvite.role}");
    expect(source).toContain("Copy this target's link");
  });
});
