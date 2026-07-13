import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Operations-surface freeze (ULTRAPLAN Phase A / A3 "freeze new ones").
// The repo is over-indexed on read-only /settings operations pages. Adding a new one must be a
// deliberate decision: a new app/settings/<x>/page.tsx fails this test until <x> is added here.
// Reducing this set toward release-safety-only is TICKET008 — gated on CI e2e, because the
// operations-coverage e2e specs currently reference every page, so deletion cannot be verified locally.
const allowedSettingsSurfaces = [
  "compliance",
  "delivery-attempts",
  "exports",
  "health",
  "operations",
  "provider",
  "queue",
  "readiness-audit",
  "runbook",
  "security",
  "validation"
].sort();

const settingsRoot = join(process.cwd(), "app", "settings");
const actualSettingsSurfaces = readdirSync(settingsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(settingsRoot, entry.name, "page.tsx")))
  .map((entry) => entry.name)
  .sort();

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("operations surface freeze", () => {
  it("keeps the /settings operations surface limited to the explicit allowlist", () => {
    expect(actualSettingsSurfaces).toEqual(allowedSettingsSurfaces);
  });

  it("does not link statically to deleted /settings pages", () => {
    const invalidLinks = sourceFilesUnder(join(process.cwd(), "app")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/href="\/settings\/([^"?#]+)(?:[?#][^"]*)?"/g)]
        .map((match) => match[1])
        .filter((surface) => !allowedSettingsSurfaces.includes(surface))
        .map((surface) => `${file}: /settings/${surface}`);
    });

    expect(invalidLinks).toEqual([]);
  });
});
