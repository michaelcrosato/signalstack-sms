import { describe, expect, it } from "vitest";
import { parseRuntimeRoleProvisioning } from "@/scripts/provision-runtime-role";

describe("runtime database role provisioning input", () => {
  it("extracts a separate bounded web login without exposing URLs", () => {
    const result = parseRuntimeRoleProvisioning({
      migrationUrl: "postgresql://owner:owner-password-value@db.example.test:5432/signalstack?schema=public",
      runtimeUrl: "postgresql://signalstack_web_login:runtime-password-value@db.example.test:5432/signalstack?schema=public",
      capability: "web"
    });
    expect(result).toMatchObject({
      runtimeRole: "signalstack_web_login",
      runtimePassword: "runtime-password-value",
      capabilityRole: "signalstack_web"
    });
  });

  it("rejects shared owners, cross-database targets, weak passwords, and unsafe role names", () => {
    const owner = "postgresql://owner:owner-password-value@db.example.test/signalstack";
    for (const runtimeUrl of [
      owner,
      "postgresql://runtime:runtime-password-value@other.example.test/signalstack",
      "postgresql://runtime:short@db.example.test/signalstack",
      "postgresql://Unsafe-Role:runtime-password-value@db.example.test/signalstack"
    ]) {
      expect(() =>
        parseRuntimeRoleProvisioning({ migrationUrl: owner, runtimeUrl, capability: "worker" })
      ).toThrow();
    }
  });
});
