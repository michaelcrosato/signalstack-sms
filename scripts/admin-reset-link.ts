import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  OperatorPasswordResetError,
  createPrismaOperatorPasswordResetService
} from "@/lib/auth/operator-password-reset";

type Environment = Readonly<Record<string, string | undefined>>;

const configSchema = z
  .object({
    AUTH_PROVIDER: z.literal("local"),
    DEMO_MODE: z.literal("false"),
    DATABASE_URL: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => /^postgres(?:ql)?:\/\//.test(value)),
    ADMIN_RESET_EMAIL: z.string().trim().email().max(320),
    ADMIN_RESET_ORG_SLUG: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ADMIN_RESET_EXPIRES_MINUTES: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((value) => value >= 5 && value <= 24 * 60)
      .optional()
  })
  .passthrough();

export async function runAdminResetLink(
  input: Readonly<{ argv?: readonly string[]; env?: Environment }> = {},
  dependencies: Readonly<{
    loadService: () => Promise<{
      issue: Awaited<ReturnType<typeof createPrismaOperatorPasswordResetService>>;
      close: () => Promise<void>;
    }>;
    writeStdout: (value: string) => void;
    writeStderr: (value: string) => void;
  }> = defaultDependencies()
): Promise<number> {
  if ((input.argv ?? process.argv.slice(2)).length !== 0) {
    dependencies.writeStderr(errorOutput("ADMIN_RESET_UNEXPECTED_ARGUMENTS"));
    return 1;
  }
  const parsed = configSchema.safeParse(input.env ?? process.env);
  if (!parsed.success) {
    dependencies.writeStderr(errorOutput("ADMIN_RESET_CONFIG_INVALID"));
    return 1;
  }

  let handle: Awaited<ReturnType<typeof dependencies.loadService>> | undefined;
  try {
    handle = await dependencies.loadService();
    const result = await handle.issue({
      email: parsed.data.ADMIN_RESET_EMAIL,
      organizationSlug: parsed.data.ADMIN_RESET_ORG_SLUG,
      expiresInMinutes: parsed.data.ADMIN_RESET_EXPIRES_MINUTES
    });
    dependencies.writeStdout(
      `${JSON.stringify({
        created: true,
        email: result.email,
        resetPath: `/reset#token=${result.token}`,
        expiresAt: result.expiresAt.toISOString()
      })}\n`
    );
    return 0;
  } catch (error) {
    const code =
      error instanceof OperatorPasswordResetError && error.code === "SUBJECT_UNAVAILABLE"
        ? "ADMIN_RESET_SUBJECT_UNAVAILABLE"
        : "ADMIN_RESET_FAILED";
    dependencies.writeStderr(errorOutput(code));
    return 1;
  } finally {
    try {
      await handle?.close();
    } catch {
      // The command has already emitted sanitized output; never reflect disconnect details.
    }
  }
}

function defaultDependencies() {
  return {
    async loadService() {
      const prisma = new PrismaClient({ log: [] });
      return {
        issue: await createPrismaOperatorPasswordResetService(prisma),
        close: () => prisma.$disconnect()
      };
    },
    writeStdout: (value: string) => process.stdout.write(value),
    writeStderr: (value: string) => process.stderr.write(value)
  };
}

function errorOutput(code: string) {
  return `${JSON.stringify({ created: false, code })}\n`;
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  void runAdminResetLink().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      process.stderr.write(errorOutput("ADMIN_RESET_FAILED"));
      process.exitCode = 1;
    }
  );
}
