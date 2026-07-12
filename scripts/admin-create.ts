import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { isValidAuthToken } from "@/lib/auth/auth-token-policy";
import type {
  OperatorAdminInput,
  OperatorAdminService
} from "@/lib/auth/operator-admin-service";

export const OPERATOR_PASSWORD_MAX_BYTES = 256;

type PasswordSource =
  | Readonly<{ kind: "file"; path: string }>
  | Readonly<{ kind: "stdin" }>;

export type AdminCreateConfiguration = Readonly<{
  mode: "bootstrap" | "existing-org";
  email: string;
  displayName: string;
  organizationSlug: string;
  passwordSource: PasswordSource;
  bootstrapToken?: string;
  organizationName?: string;
  timezone?: string;
}>;

export type PasswordFileSnapshot = Readonly<{
  contents: Buffer;
  mode: number;
  isFile: boolean;
  isSymbolicLink: boolean;
}>;

export type AdminCreateServiceHandle = Readonly<{
  service: OperatorAdminService;
  close(): Promise<void>;
}>;

export type AdminCreateDependencies = Readonly<{
  loadService(input: Readonly<{ bootstrapToken?: string }>): Promise<AdminCreateServiceHandle>;
  readPasswordFile(path: string, maximumBytes: number): Promise<PasswordFileSnapshot>;
  readStdin(maximumBytes: number): Promise<Buffer>;
  stdinIsTTY: boolean;
  platform: NodeJS.Platform;
  writeStdout(value: string): void;
  writeStderr(value: string): void;
}>;

export type AdminCreateCliErrorCode =
  | "ADMIN_CREATE_CONFIG_INVALID"
  | "ADMIN_CREATE_UNEXPECTED_ARGUMENTS"
  | "ADMIN_CREATE_SECRET_ENV_FORBIDDEN"
  | "ADMIN_CREATE_PASSWORD_SOURCE_INVALID"
  | "ADMIN_CREATE_PASSWORD_FILE_INVALID"
  | "ADMIN_CREATE_PASSWORD_FILE_UNSAFE"
  | "ADMIN_CREATE_PASSWORD_TOO_LARGE"
  | "ADMIN_CREATE_PASSWORD_ENCODING_INVALID"
  | "ADMIN_CREATE_PASSWORD_STDIN_INTERACTIVE"
  | "ADMIN_CREATE_FAILED";

export class AdminCreateCliError extends Error {
  constructor(readonly code: AdminCreateCliErrorCode) {
    super("Operator administrator command failed.");
    this.name = "AdminCreateCliError";
  }
}

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const displayNameSchema = z.string().trim().min(1).max(120);
const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const organizationNameSchema = z.string().trim().min(1).max(160);
const timezoneSchema = z.string().trim().min(1).max(100).refine(isIanaTimezone);
const databaseUrlSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"));

export function parseAdminCreateConfiguration(input: Readonly<{
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}>): AdminCreateConfiguration {
  // Accepting no arguments makes shell history and process-list exposure impossible, including for
  // argument names the parser does not recognize. Never echo a rejected argument.
  if (input.argv.length > 0) {
    throw new AdminCreateCliError("ADMIN_CREATE_UNEXPECTED_ARGUMENTS");
  }

  if (input.env.ADMIN_CREATE_PASSWORD || input.env.ADMIN_CREATE_BOOTSTRAP_TOKEN) {
    throw new AdminCreateCliError("ADMIN_CREATE_SECRET_ENV_FORBIDDEN");
  }

  if (
    input.env.AUTH_PROVIDER !== "local" ||
    input.env.DEMO_MODE !== "false" ||
    !databaseUrlSchema.safeParse(input.env.DATABASE_URL).success
  ) {
    throw new AdminCreateCliError("ADMIN_CREATE_CONFIG_INVALID");
  }

  const passwordSource = parsePasswordSource(input.env);
  const common = z
    .object({
      mode: z.enum(["bootstrap", "existing-org"]),
      email: emailSchema,
      displayName: displayNameSchema,
      organizationSlug: slugSchema
    })
    .safeParse({
      mode: input.env.ADMIN_CREATE_MODE,
      email: input.env.ADMIN_CREATE_EMAIL,
      displayName: input.env.ADMIN_CREATE_DISPLAY_NAME,
      organizationSlug: input.env.ADMIN_CREATE_ORG_SLUG
    });
  if (!common.success) {
    throw new AdminCreateCliError("ADMIN_CREATE_CONFIG_INVALID");
  }

  if (common.data.mode === "existing-org") {
    return Object.freeze({ ...common.data, passwordSource });
  }

  const bootstrap = z
    .object({
      bootstrapToken: z.string().refine(isValidAuthToken),
      organizationName: organizationNameSchema,
      timezone: timezoneSchema
    })
    .safeParse({
      bootstrapToken: input.env.BOOTSTRAP_TOKEN,
      organizationName: input.env.ADMIN_CREATE_ORG_NAME,
      timezone: input.env.ADMIN_CREATE_TIMEZONE
    });
  if (!bootstrap.success) {
    throw new AdminCreateCliError("ADMIN_CREATE_CONFIG_INVALID");
  }

  return Object.freeze({
    ...common.data,
    ...bootstrap.data,
    passwordSource
  });
}

export async function runAdminCreate(
  input: Readonly<{
    argv?: readonly string[];
    env?: Readonly<Record<string, string | undefined>>;
  }> = {},
  dependencies: AdminCreateDependencies = defaultDependencies()
): Promise<number> {
  let handle: AdminCreateServiceHandle | undefined;
  try {
    const configuration = parseAdminCreateConfiguration({
      argv: input.argv ?? process.argv.slice(2),
      env: input.env ?? process.env
    });
    const password = await readOperatorPassword(configuration.passwordSource, dependencies);
    handle = await dependencies.loadService({ bootstrapToken: configuration.bootstrapToken });
    const result = await handle.service.create(toServiceInput(configuration, password));

    dependencies.writeStdout(`${JSON.stringify(result)}\n`);
    return result.created ? 0 : 2;
  } catch (error) {
    const code = error instanceof AdminCreateCliError ? error.code : "ADMIN_CREATE_FAILED";
    // Error output is intentionally code-only: filesystem, database, configuration, and secret
    // material from an underlying error must never be reflected to an operator console or log.
    dependencies.writeStderr(`${JSON.stringify({ created: false, code })}\n`);
    return 1;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Closing a client must not emit its possibly sensitive connection error after sanitized output.
      }
    }
  }
}

async function readOperatorPassword(
  source: PasswordSource,
  dependencies: AdminCreateDependencies
): Promise<string> {
  let contents: Buffer;

  if (source.kind === "stdin") {
    if (dependencies.stdinIsTTY) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_STDIN_INTERACTIVE");
    }
    try {
      contents = await dependencies.readStdin(OPERATOR_PASSWORD_MAX_BYTES);
    } catch (error) {
      if (error instanceof AdminCreateCliError) {
        throw error;
      }
      throw new AdminCreateCliError("ADMIN_CREATE_FAILED");
    }
  } else {
    let snapshot: PasswordFileSnapshot;
    try {
      snapshot = await dependencies.readPasswordFile(source.path, OPERATOR_PASSWORD_MAX_BYTES);
    } catch (error) {
      if (error instanceof AdminCreateCliError) {
        throw error;
      }
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_FILE_INVALID");
    }
    if (!snapshot.isFile || snapshot.isSymbolicLink) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_FILE_INVALID");
    }
    if (dependencies.platform === "win32") {
      dependencies.writeStderr(
        `${JSON.stringify({ warning: "ADMIN_CREATE_PASSWORD_FILE_PERMISSIONS_UNVERIFIED" })}\n`
      );
    } else if ((snapshot.mode & 0o400) === 0 || (snapshot.mode & 0o077) !== 0) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_FILE_UNSAFE");
    }
    contents = snapshot.contents;
  }

  if (contents.byteLength > OPERATOR_PASSWORD_MAX_BYTES) {
    throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_TOO_LARGE");
  }

  try {
    // Fatal UTF-8 decoding prevents replacement-character mutation. No trim or newline removal occurs.
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_ENCODING_INVALID");
  }
}

function parsePasswordSource(
  env: Readonly<Record<string, string | undefined>>
): PasswordSource {
  const file = env.ADMIN_CREATE_PASSWORD_FILE;
  const stdinValue = env.ADMIN_CREATE_PASSWORD_STDIN ?? "false";
  if (stdinValue !== "true" && stdinValue !== "false") {
    throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_SOURCE_INVALID");
  }

  const useFile = typeof file === "string" && file.length > 0;
  const useStdin = stdinValue === "true";
  if (useFile === useStdin) {
    throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_SOURCE_INVALID");
  }

  return useFile
    ? Object.freeze({ kind: "file", path: file })
    : Object.freeze({ kind: "stdin" });
}

function toServiceInput(
  configuration: AdminCreateConfiguration,
  password: string
): OperatorAdminInput {
  if (configuration.mode === "bootstrap") {
    return {
      mode: "bootstrap",
      bootstrapToken: configuration.bootstrapToken!,
      email: configuration.email,
      displayName: configuration.displayName,
      password,
      organizationName: configuration.organizationName!,
      organizationSlug: configuration.organizationSlug,
      timezone: configuration.timezone!
    };
  }

  return {
    mode: "existing-org",
    email: configuration.email,
    displayName: configuration.displayName,
    password,
    organizationSlug: configuration.organizationSlug
  };
}

async function readStdinBounded(maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maximumBytes) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

export async function readPasswordFileBounded(
  path: string,
  maximumBytes: number
): Promise<PasswordFileSnapshot> {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    return {
      contents: Buffer.alloc(0),
      mode: before.mode,
      isFile: before.isFile(),
      isSymbolicLink: before.isSymbolicLink()
    };
  }
  if (before.size > maximumBytes) {
    throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_TOO_LARGE");
  }

  const noFollow = process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0);
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const after = await handle.stat();
    if (
      !after.isFile() ||
      (process.platform !== "win32" &&
        (before.dev !== after.dev || before.ino !== after.ino))
    ) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_FILE_INVALID");
    }
    if (after.size > maximumBytes) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_TOO_LARGE");
    }

    const contents = Buffer.alloc(maximumBytes + 1);
    const { bytesRead } = await handle.read(contents, 0, contents.byteLength, 0);
    if (bytesRead > maximumBytes) {
      throw new AdminCreateCliError("ADMIN_CREATE_PASSWORD_TOO_LARGE");
    }
    return {
      contents: contents.subarray(0, bytesRead),
      mode: after.mode,
      isFile: true,
      isSymbolicLink: false
    };
  } finally {
    await handle.close();
  }
}

function defaultDependencies(): AdminCreateDependencies {
  return {
    async loadService(input) {
      const [{ createPrismaOperatorAdminService }, { PrismaClient }] = await Promise.all([
        import("@/lib/auth/operator-admin-store"),
        import("@prisma/client")
      ]);
      // The operator boundary owns a silent client so Prisma cannot print connection strings,
      // query diagnostics, or filesystem details around the command's code-only error handling.
      const prisma = new PrismaClient({
        log: [],
        datasourceUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
      });
      return {
        service: await createPrismaOperatorAdminService({ ...input, prismaClient: prisma }),
        close: () => prisma.$disconnect()
      };
    },
    readPasswordFile: readPasswordFileBounded,
    readStdin: readStdinBounded,
    stdinIsTTY: process.stdin.isTTY === true,
    platform: process.platform,
    writeStdout: (value) => process.stdout.write(value),
    writeStderr: (value) => process.stderr.write(value)
  };
}

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  void runAdminCreate().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      process.stderr.write(
        `${JSON.stringify({ created: false, code: "ADMIN_CREATE_FAILED" })}\n`
      );
      process.exitCode = 1;
    }
  );
}
