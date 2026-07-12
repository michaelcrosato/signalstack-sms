import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directPrismaModule = "@/lib/db/prisma";
const scannedRoots = ["app", "lib", "workers"] as const;

type AllowlistClassification = "control-plane" | "tenant-context-seam" | "tenant-migration-debt";

export type DirectPrismaAllowlistEntry = Readonly<{
  classification: AllowlistClassification;
  reason: string;
}>;

/**
 * Explicit inventory of the direct Prisma imports that predate the M2 tenant-context migration.
 *
 * `control-plane` entries resolve identity or installation-global state before a tenant can be known.
 * `tenant-context-seam` is the sole boundary allowed to construct a tenant transaction.
 * `tenant-migration-debt` entries are frozen migration debt: they may be removed, but new entries must
 * not be added as a shortcut around the tenant database capability.
 */
export const directPrismaImportAllowlist: Readonly<Record<string, DirectPrismaAllowlistEntry>> =
  Object.freeze({
    "lib/auth/local-credential-store.ts": controlPlane("Credential verification is installation-global."),
    "lib/auth/operator-admin-store.ts": controlPlane("Operator bootstrap is an explicit control-plane seam."),
    "lib/auth/operator-password-reset.ts": controlPlane("Operator recovery is an explicit control-plane seam."),
    "lib/db/runtime-posture.ts": {
      classification: "tenant-context-seam",
      reason: "This seam verifies the connected runtime database role and protected-table posture."
    },
    "lib/db/tenant-context.ts": {
      classification: "tenant-context-seam",
      reason: "This boundary constructs transaction-local tenant and auth database contexts."
    }
  });

export type DirectPrismaImport = Readonly<{
  file: string;
  line: number;
}>;

export type TenantBoundaryCheckResult = Readonly<{
  imports: readonly DirectPrismaImport[];
  unauthorized: readonly DirectPrismaImport[];
  staleAllowlistEntries: readonly string[];
}>;

export function findDirectPrismaImportLines(source: string, fileName = "source.ts"): number[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const lines: number[] = [];

  function record(node: ts.Node, moduleName: string | null) {
    if (moduleName !== directPrismaModule) {
      return;
    }
    lines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node, stringLiteralValue(node.moduleSpecifier));
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = stringLiteralValue(node.arguments[0]);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        record(node, argument);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        record(node, argument);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(lines)].sort((left, right) => left - right);
}

export function checkTenantBoundary(
  rootDirectory = process.cwd(),
  allowlist: Readonly<Record<string, DirectPrismaAllowlistEntry>> = directPrismaImportAllowlist
): TenantBoundaryCheckResult {
  const imports = scannedRoots
    .flatMap((root) => collectSourceFiles(path.join(rootDirectory, root)))
    .flatMap((absolutePath) => {
      const relativePath = normalizePath(path.relative(rootDirectory, absolutePath));
      return findDirectPrismaImportLines(readFileSync(absolutePath, "utf8"), relativePath).map(
        (line) => ({ file: relativePath, line })
      );
    })
    .sort(compareImports);
  const importedFiles = new Set(imports.map(({ file }) => file));
  const unauthorized = imports.filter(({ file }) => !(file in allowlist));
  const staleAllowlistEntries = Object.keys(allowlist)
    .filter((file) => !importedFiles.has(file))
    .sort();

  return Object.freeze({
    imports: Object.freeze(imports),
    unauthorized: Object.freeze(unauthorized),
    staleAllowlistEntries: Object.freeze(staleAllowlistEntries)
  });
}

export function formatTenantBoundaryResult(result: TenantBoundaryCheckResult): string {
  const classifications = Object.values(directPrismaImportAllowlist).reduce(
    (counts, entry) => {
      counts[entry.classification] += 1;
      return counts;
    },
    { "control-plane": 0, "tenant-context-seam": 0, "tenant-migration-debt": 0 }
  );
  return [
    `Direct Prisma boundary inventory: ${result.imports.length} file(s).`,
    `Allowlist: ${classifications["control-plane"]} control-plane, ${classifications["tenant-context-seam"]} context seam, ${classifications["tenant-migration-debt"]} migration debt.`,
    ...result.unauthorized.map(({ file, line }) => `UNAUTHORIZED_DIRECT_PRISMA_IMPORT ${file}:${line}`),
    ...result.staleAllowlistEntries.map((file) => `STALE_DIRECT_PRISMA_ALLOWLIST_ENTRY ${file}`)
  ].join("\n");
}

function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }
    return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

function stringLiteralValue(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function normalizePath(value: string) {
  return value.replaceAll(path.sep, "/");
}

function compareImports(left: DirectPrismaImport, right: DirectPrismaImport) {
  return left.file.localeCompare(right.file) || left.line - right.line;
}

function controlPlane(reason: string): DirectPrismaAllowlistEntry {
  return { classification: "control-plane", reason };
}

function runCli() {
  const result = checkTenantBoundary();
  console.log(formatTenantBoundaryResult(result));
  if (result.unauthorized.length > 0 || result.staleAllowlistEntries.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
