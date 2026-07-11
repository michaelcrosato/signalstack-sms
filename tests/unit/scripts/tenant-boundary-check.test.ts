import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkTenantBoundary,
  directPrismaImportAllowlist,
  findDirectPrismaImportLines,
  formatTenantBoundaryResult,
  type DirectPrismaAllowlistEntry
} from "@/scripts/tenant-boundary-check";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("tenant Prisma boundary inventory", () => {
  it("detects static, dynamic, re-export, and require imports without matching comments", () => {
    const source = [
      `import { prisma } from "@/lib/db/prisma";`,
      `const lazy = import("@/lib/db/prisma");`,
      `export { prisma as database } from "@/lib/db/prisma";`,
      `const legacy = require("@/lib/db/prisma");`,
      `// import { prisma } from "@/lib/db/prisma";`,
      `const text = 'import("@/lib/db/prisma")';`
    ].join("\n");

    expect(findDirectPrismaImportLines(source)).toEqual([1, 2, 3, 4]);
  });

  it("reports unauthorized imports and stale allowlist entries from fixed runtime roots", () => {
    const root = temporaryRoot();
    writeSource(root, "app/allowed.ts", `import { prisma } from "@/lib/db/prisma";`);
    writeSource(root, "lib/new-tenant-module.ts", `const db = import("@/lib/db/prisma");`);
    writeSource(root, "workers/no-database.ts", `export const value = 1;`);
    const allowlist: Record<string, DirectPrismaAllowlistEntry> = {
      "app/allowed.ts": {
        classification: "control-plane",
        reason: "Test control-plane seam."
      },
      "lib/removed.ts": {
        classification: "tenant-migration-debt",
        reason: "Test stale entry."
      }
    };

    const result = checkTenantBoundary(root, allowlist);

    expect(result.imports).toEqual([
      { file: "app/allowed.ts", line: 1 },
      { file: "lib/new-tenant-module.ts", line: 1 }
    ]);
    expect(result.unauthorized).toEqual([
      { file: "lib/new-tenant-module.ts", line: 1 }
    ]);
    expect(result.staleAllowlistEntries).toEqual(["lib/removed.ts"]);
  });

  it("keeps every exception explicit, classified, documented, and currently exercised", () => {
    for (const [file, entry] of Object.entries(directPrismaImportAllowlist)) {
      expect(file).toMatch(/^(?:app|lib|workers)\/.+\.tsx?$/);
      expect(entry.reason.length).toBeGreaterThan(20);
    }

    const result = checkTenantBoundary();
    expect(result.unauthorized).toEqual([]);
    expect(result.staleAllowlistEntries).toEqual([]);
    expect(result.imports).toHaveLength(Object.keys(directPrismaImportAllowlist).length);
    expect(formatTenantBoundaryResult(result)).not.toContain("UNAUTHORIZED_");
    expect(formatTenantBoundaryResult(result)).not.toContain("STALE_");
  });
});

function temporaryRoot() {
  const directory = mkdtempSync(path.join(tmpdir(), "signalstack-tenant-boundary-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSource(root: string, relativePath: string, source: string) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
}
