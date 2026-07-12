import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  OperatorAdminInput,
  OperatorAdminResult,
  OperatorAdminService
} from "@/lib/auth/operator-admin-service";
import {
  AdminCreateCliError,
  OPERATOR_PASSWORD_MAX_BYTES,
  parseAdminCreateConfiguration,
  readPasswordFileBounded,
  runAdminCreate,
  type AdminCreateDependencies,
  type PasswordFileSnapshot
} from "@/scripts/admin-create";

const rawPassword = "correct horse battery staple\n";
const bootstrapToken = "bootstrap-token-0123456789-abcdefghijk";
const databaseUrl = "postgresql://db-user:db-secret@localhost:5432/signalstack_test";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("admin:create operator command", () => {
  it("reads an exact stdin password, creates an existing-org owner, and emits sanitized JSON", async () => {
    const harness = createHarness();
    const exitCode = await runAdminCreate(
      { argv: [], env: recoveryEnvironment() },
      harness.dependencies
    );

    expect(exitCode).toBe(0);
    expect(harness.service.create).toHaveBeenCalledWith({
      mode: "existing-org",
      email: "owner@example.test",
      displayName: "Recovery Owner",
      password: rawPassword,
      organizationSlug: "acme"
    });
    expect(harness.stdout).toEqual([
      `${JSON.stringify({
        created: true,
        user: { id: "user-1", email: "owner@example.test" },
        organization: { id: "org-1", slug: "acme" },
        role: "OWNER"
      })}\n`
    ]);
    expect(harness.stderr).toEqual([]);
    expect(harness.closed).toBe(1);
    const output = `${harness.stdout.join("")}${harness.stderr.join("")}`;
    expect(output).not.toContain(rawPassword);
    expect(output).not.toContain(databaseUrl);
    expect(output).not.toContain("db-secret");
  });

  it("uses only the server BOOTSTRAP_TOKEN for first-owner bootstrap and never emits it", async () => {
    const harness = createHarness();
    const env = {
      ...recoveryEnvironment(),
      ADMIN_CREATE_MODE: "bootstrap",
      BOOTSTRAP_TOKEN: bootstrapToken,
      ADMIN_CREATE_ORG_NAME: "Acme Incorporated",
      ADMIN_CREATE_TIMEZONE: "America/Vancouver"
    };

    expect(await runAdminCreate({ argv: [], env }, harness.dependencies)).toBe(0);
    expect(harness.loadedWith).toEqual([{ bootstrapToken }]);
    expect(harness.service.create).toHaveBeenCalledWith({
      mode: "bootstrap",
      bootstrapToken,
      email: "owner@example.test",
      displayName: "Recovery Owner",
      password: rawPassword,
      organizationName: "Acme Incorporated",
      organizationSlug: "acme",
      timezone: "America/Vancouver"
    });
    const output = `${harness.stdout.join("")}${harness.stderr.join("")}`;
    expect(output).not.toContain(bootstrapToken);
    expect(output).not.toContain(rawPassword);
  });

  it.each([
    ["positional password", [rawPassword]],
    ["named password", [`--password=${rawPassword}`]],
    ["named bootstrap token", [`--bootstrap-token=${bootstrapToken}`]],
    ["unknown option", ["--force"]]
  ])("rejects every CLI argument without reflecting %s", async (_label, argv) => {
    const harness = createHarness();
    expect(await runAdminCreate({ argv, env: recoveryEnvironment() }, harness.dependencies)).toBe(1);
    expect(harness.service.create).not.toHaveBeenCalled();
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([
      `${JSON.stringify({ created: false, code: "ADMIN_CREATE_UNEXPECTED_ARGUMENTS" })}\n`
    ]);
    const output = harness.stderr.join("");
    for (const argument of argv) {
      expect(output).not.toContain(argument);
    }
  });

  it("rejects password and alternate bootstrap-token environment variables", async () => {
    for (const forbidden of [
      { ADMIN_CREATE_PASSWORD: rawPassword },
      { ADMIN_CREATE_BOOTSTRAP_TOKEN: bootstrapToken }
    ]) {
      const harness = createHarness();
      const env = { ...recoveryEnvironment(), ...forbidden };
      expect(await runAdminCreate({ argv: [], env }, harness.dependencies)).toBe(1);
      expect(harness.stderr.join("")).toContain("ADMIN_CREATE_SECRET_ENV_FORBIDDEN");
      expect(harness.stderr.join("")).not.toContain(rawPassword);
      expect(harness.stderr.join("")).not.toContain(bootstrapToken);
    }
  });

  it.each([
    { AUTH_PROVIDER: "oidc" },
    { DEMO_MODE: "true" },
    { DATABASE_URL: "" },
    { ADMIN_CREATE_MODE: "recover" },
    { ADMIN_CREATE_EMAIL: "invalid-email" },
    { ADMIN_CREATE_DISPLAY_NAME: "" },
    { ADMIN_CREATE_ORG_SLUG: "Acme" }
  ])("fails closed for malformed operator configuration: %o", async (override) => {
    const harness = createHarness();
    const env = { ...recoveryEnvironment(), ...override };
    expect(await runAdminCreate({ argv: [], env }, harness.dependencies)).toBe(1);
    expect(harness.service.create).not.toHaveBeenCalled();
    expect(harness.stderr.join("")).toContain("ADMIN_CREATE_CONFIG_INVALID");
    expect(harness.stderr.join("")).not.toContain(databaseUrl);
  });

  it("requires exactly one password source and rejects malformed stdin controls", async () => {
    for (const override of [
      { ADMIN_CREATE_PASSWORD_STDIN: "false", ADMIN_CREATE_PASSWORD_FILE: "" },
      { ADMIN_CREATE_PASSWORD_STDIN: "true", ADMIN_CREATE_PASSWORD_FILE: "secret.txt" },
      { ADMIN_CREATE_PASSWORD_STDIN: "yes", ADMIN_CREATE_PASSWORD_FILE: "" }
    ]) {
      const harness = createHarness();
      const env = { ...recoveryEnvironment(), ...override };
      expect(await runAdminCreate({ argv: [], env }, harness.dependencies)).toBe(1);
      expect(harness.stderr.join("")).toContain("ADMIN_CREATE_PASSWORD_SOURCE_INVALID");
      expect(harness.service.create).not.toHaveBeenCalled();
    }
  });

  it("refuses interactive stdin, oversized input, and malformed UTF-8", async () => {
    const cases: Array<{
      overrides: Partial<AdminCreateDependencies>;
      code: string;
    }> = [
      { overrides: { stdinIsTTY: true }, code: "ADMIN_CREATE_PASSWORD_STDIN_INTERACTIVE" },
      {
        overrides: {
          readStdin: vi.fn(async () => Buffer.alloc(OPERATOR_PASSWORD_MAX_BYTES + 1, "x"))
        },
        code: "ADMIN_CREATE_PASSWORD_TOO_LARGE"
      },
      {
        overrides: { readStdin: vi.fn(async () => Buffer.from([0xc3, 0x28])) },
        code: "ADMIN_CREATE_PASSWORD_ENCODING_INVALID"
      }
    ];

    for (const testCase of cases) {
      const harness = createHarness(testCase.overrides);
      expect(
        await runAdminCreate({ argv: [], env: recoveryEnvironment() }, harness.dependencies)
      ).toBe(1);
      expect(harness.stderr.join("")).toContain(testCase.code);
      expect(harness.service.create).not.toHaveBeenCalled();
    }
  });

  it("accepts a protected file, preserves its bytes, and refuses unsafe file evidence", async () => {
    const safeHarness = createHarness({
      platform: "linux",
      readPasswordFile: vi.fn(async () => fileSnapshot({ mode: 0o600 }))
    });
    const fileEnv = {
      ...recoveryEnvironment(),
      ADMIN_CREATE_PASSWORD_STDIN: "false",
      ADMIN_CREATE_PASSWORD_FILE: "/run/secrets/admin-password"
    };
    expect(await runAdminCreate({ argv: [], env: fileEnv }, safeHarness.dependencies)).toBe(0);
    expect(safeHarness.service.create).toHaveBeenCalledWith(
      expect.objectContaining({ password: rawPassword })
    );

    for (const snapshot of [
      fileSnapshot({ mode: 0o644 }),
      fileSnapshot({ mode: 0o040 }),
      fileSnapshot({ isFile: false }),
      fileSnapshot({ isSymbolicLink: true })
    ]) {
      const harness = createHarness({
        platform: "linux",
        readPasswordFile: vi.fn(async () => snapshot)
      });
      expect(await runAdminCreate({ argv: [], env: fileEnv }, harness.dependencies)).toBe(1);
      expect(harness.service.create).not.toHaveBeenCalled();
      expect(harness.stderr.join("")).toMatch(
        /ADMIN_CREATE_PASSWORD_FILE_(?:UNSAFE|INVALID)/
      );
    }
  });

  it("warns when Windows ACL safety cannot be portably proven without printing file contents", async () => {
    const harness = createHarness({
      platform: "win32",
      readPasswordFile: vi.fn(async () => fileSnapshot({ mode: 0o666 }))
    });
    const env = {
      ...recoveryEnvironment(),
      ADMIN_CREATE_PASSWORD_STDIN: "false",
      ADMIN_CREATE_PASSWORD_FILE: "C:\\secrets\\admin-password"
    };
    expect(await runAdminCreate({ argv: [], env }, harness.dependencies)).toBe(0);
    expect(harness.stderr).toEqual([
      `${JSON.stringify({ warning: "ADMIN_CREATE_PASSWORD_FILE_PERMISSIONS_UNVERIFIED" })}\n`
    ]);
    expect(harness.stderr.join("")).not.toContain(rawPassword);
  });

  it("bounds the real file reader before returning secret bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "signalstack-admin-create-"));
    temporaryDirectories.push(directory);
    const safePath = join(directory, "safe-password");
    const oversizedPath = join(directory, "oversized-password");
    await writeFile(safePath, Buffer.from(rawPassword, "utf8"), { mode: 0o600 });
    await writeFile(oversizedPath, Buffer.alloc(OPERATOR_PASSWORD_MAX_BYTES + 1, "x"), {
      mode: 0o600
    });

    await expect(readPasswordFileBounded(safePath, OPERATOR_PASSWORD_MAX_BYTES)).resolves.toMatchObject({
      contents: Buffer.from(rawPassword, "utf8"),
      isFile: true,
      isSymbolicLink: false
    });
    await expect(
      readPasswordFileBounded(oversizedPath, OPERATOR_PASSWORD_MAX_BYTES)
    ).rejects.toEqual(new AdminCreateCliError("ADMIN_CREATE_PASSWORD_TOO_LARGE"));
  });

  it("maps domain denial and unexpected failures to secret-free nonzero output", async () => {
    const denied = createHarness({
      serviceResult: { created: false, code: "ADMIN_IDENTITY_EXISTS" }
    });
    expect(await runAdminCreate({ argv: [], env: recoveryEnvironment() }, denied.dependencies)).toBe(2);
    expect(denied.stdout.join("")).toContain("ADMIN_IDENTITY_EXISTS");

    const failed = createHarness({ serviceError: new Error(`database ${rawPassword} ${databaseUrl}`) });
    expect(await runAdminCreate({ argv: [], env: recoveryEnvironment() }, failed.dependencies)).toBe(1);
    expect(failed.stderr).toEqual([
      `${JSON.stringify({ created: false, code: "ADMIN_CREATE_FAILED" })}\n`
    ]);
    expect(failed.stderr.join("")).not.toContain(rawPassword);
    expect(failed.stderr.join("")).not.toContain(databaseUrl);
  });

  it("exposes a parser result with no database URL or password material", () => {
    const parsed = parseAdminCreateConfiguration({ argv: [], env: recoveryEnvironment() });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain(databaseUrl);
    expect(serialized).not.toContain(rawPassword);
    expect(serialized).toContain("existing-org");
  });

  it("runs the real npm entrypoint and sanitizes Prisma connection failures", () => {
    const npmExecPath = process.env.npm_execpath;
    expect(npmExecPath).toBeTruthy();
    const databaseSentinel = "CLI_DB_DETAIL_MUST_NOT_ESCAPE";
    const result = spawnSync(process.execPath, [npmExecPath!, "run", "admin:create"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTH_PROVIDER: "local",
        DEMO_MODE: "false",
        DATABASE_URL: `postgresql://cli_user:${databaseSentinel}@127.0.0.1:1/missing?connect_timeout=1`,
        ADMIN_CREATE_MODE: "existing-org",
        ADMIN_CREATE_EMAIL: "cli-owner@example.test",
        ADMIN_CREATE_DISPLAY_NAME: "CLI Owner",
        ADMIN_CREATE_ORG_SLUG: "missing-org",
        ADMIN_CREATE_PASSWORD_STDIN: "true",
        ADMIN_CREATE_PASSWORD_FILE: ""
      },
      input: rawPassword,
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true
    });

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(result.status).toBe(1);
    expect(output).toContain("ADMIN_CREATE_FAILED");
    expect(output).not.toContain(databaseSentinel);
    expect(output).not.toContain(rawPassword.trim());
    expect(output).not.toContain("Top-level await");
    expect(output).not.toContain("scripts/admin-create.ts:");
  });
});

function recoveryEnvironment(): Record<string, string> {
  return {
    AUTH_PROVIDER: "local",
    DEMO_MODE: "false",
    DATABASE_URL: databaseUrl,
    ADMIN_CREATE_MODE: "existing-org",
    ADMIN_CREATE_EMAIL: " Owner@Example.Test ",
    ADMIN_CREATE_DISPLAY_NAME: " Recovery Owner ",
    ADMIN_CREATE_ORG_SLUG: "acme",
    ADMIN_CREATE_PASSWORD_STDIN: "true",
    ADMIN_CREATE_PASSWORD_FILE: ""
  };
}

function createHarness(
  overrides: Partial<AdminCreateDependencies> & {
    serviceResult?: Awaited<ReturnType<OperatorAdminService["create"]>>;
    serviceError?: Error;
  } = {}
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const loadedWith: Array<{ bootstrapToken?: string }> = [];
  let closed = 0;
  const service = {
    create: vi.fn(async (input: OperatorAdminInput): Promise<OperatorAdminResult> => {
      void input;
      if (overrides.serviceError) {
        throw overrides.serviceError;
      }
      return (
        overrides.serviceResult ?? {
          created: true as const,
          user: { id: "user-1", email: "owner@example.test" },
          organization: { id: "org-1", slug: "acme" },
          role: "OWNER" as const
        }
      );
    })
  } satisfies OperatorAdminService;
  const dependencies: AdminCreateDependencies = {
    loadService: vi.fn(async (input) => {
      loadedWith.push(input);
      return {
        service,
        async close() {
          closed += 1;
        }
      };
    }),
    readPasswordFile: vi.fn(async () => fileSnapshot()),
    readStdin: vi.fn(async () => Buffer.from(rawPassword, "utf8")),
    stdinIsTTY: false,
    platform: "linux",
    writeStdout: (value) => stdout.push(value),
    writeStderr: (value) => stderr.push(value),
    ...overrides
  };

  return {
    dependencies,
    service,
    stdout,
    stderr,
    loadedWith,
    get closed() {
      return closed;
    }
  };
}

function fileSnapshot(overrides: Partial<PasswordFileSnapshot> = {}): PasswordFileSnapshot {
  return {
    contents: Buffer.from(rawPassword, "utf8"),
    mode: 0o600,
    isFile: true,
    isSymbolicLink: false,
    ...overrides
  };
}
