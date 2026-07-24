import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { runAdminResetLink } from "@/scripts/admin-reset-link";

const TOKEN = `ss_reset_${"z".repeat(43)}`;

describe("admin:reset-link operator command", () => {
  vi.setConfig({ testTimeout: 20000 });
  it("prints one reset fragment from a zero-argument sanitized operator boundary", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const issue = vi.fn(async () => ({
      token: TOKEN,
      email: "target@example.test",
      expiresAt: new Date("2030-01-01T01:00:00.000Z")
    }));
    const close = vi.fn(async () => undefined);
    const exitCode = await runAdminResetLink(
      { argv: [], env: validEnvironment() },
      {
        loadService: async () => ({ issue, close }),
        writeStdout: (value) => stdout.push(value),
        writeStderr: (value) => stderr.push(value)
      }
    );

    expect(exitCode).toBe(0);
    expect(issue).toHaveBeenCalledWith({
      email: "target@example.test",
      organizationSlug: "reset-org",
      expiresInMinutes: 60
    });
    expect(JSON.parse(stdout.join(""))).toEqual({
      created: true,
      email: "target@example.test",
      resetPath: `/reset#token=${TOKEN}`,
      expiresAt: "2030-01-01T01:00:00.000Z"
    });
    expect(stderr).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects every argument and malformed configuration without loading Prisma", async () => {
    for (const input of [
      { argv: ["--email=private@example.test"], env: validEnvironment() },
      { argv: [], env: { ...validEnvironment(), DATABASE_URL: "" } },
      { argv: [], env: { ...validEnvironment(), AUTH_PROVIDER: "oidc" } }
    ]) {
      const stderr: string[] = [];
      const loadService = vi.fn();
      expect(
        await runAdminResetLink(input, {
          loadService,
          writeStdout: () => undefined,
          writeStderr: (value) => stderr.push(value)
        })
      ).toBe(1);
      expect(loadService).not.toHaveBeenCalled();
      expect(stderr.join("")).not.toContain("private@example.test");
    }
  });

  it("runs the real entrypoint and hides Prisma connection details", { timeout: 20000 }, () => {
    const npmExecPath = process.env.npm_execpath;
    expect(npmExecPath).toBeTruthy();
    const sentinel = "RESET_LINK_DB_DETAIL_MUST_NOT_ESCAPE";
    const result = spawnSync(process.execPath, [npmExecPath!, "run", "admin:reset-link"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...validEnvironment(),
        DATABASE_URL: `postgresql://reset_user:${sentinel}@127.0.0.1:1/missing?connect_timeout=1`
      },
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status).toBe(1);
    expect(output).toContain("ADMIN_RESET_FAILED");
    expect(output).not.toContain(sentinel);
    expect(output).not.toContain("Top-level await");
    expect(output).not.toContain("scripts/admin-reset-link.ts:");
  });
});

function validEnvironment(): Record<string, string> {
  return {
    AUTH_PROVIDER: "local",
    DEMO_MODE: "false",
    DATABASE_URL: "postgresql://user:password@localhost:5432/signalstack",
    ADMIN_RESET_EMAIL: "target@example.test",
    ADMIN_RESET_ORG_SLUG: "reset-org",
    ADMIN_RESET_EXPIRES_MINUTES: "60"
  };
}
