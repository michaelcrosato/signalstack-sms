import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Operations-surface freeze (ULTRAPLAN Phase A / A3 "freeze new ones").
// The repo is over-indexed on read-only /settings operations pages. Adding a new one must be a
// deliberate decision: a new app/settings/<x>/page.tsx fails this test until <x> is added here.
// Reducing this set toward release-safety-only is TICKET008 — gated on CI e2e, because the
// operations-coverage e2e specs currently reference every page, so deletion cannot be verified locally.
const allowedSettingsSurfaces = [
  "compliance",
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

describe("operations surface freeze", () => {
  it("keeps the /settings operations surface limited to the explicit allowlist", () => {
    expect(actualSettingsSurfaces).toEqual(allowedSettingsSurfaces);
  });
});
