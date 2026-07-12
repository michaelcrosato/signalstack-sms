import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dockerContextPathIsExcluded,
  parseDockerIgnore,
  requiredDockerBuildInputs,
  runDockerContextCheck,
  safeDockerContextPaths,
  sensitiveDockerContextPaths,
  validateDockerIgnore
} from "@/scripts/docker-context-check";

const dockerIgnore = readFileSync(join(process.cwd(), ".dockerignore"), "utf8");

describe("Docker build context safety", () => {
  it("excludes secrets, VCS data, dependencies, build output, logs, and test artifacts", () => {
    const rules = parseDockerIgnore(dockerIgnore);

    for (const path of sensitiveDockerContextPaths) {
      expect(dockerContextPathIsExcluded(path, rules), path).toBe(true);
    }
  });

  it("retains the safe environment template and every required build input", () => {
    const rules = parseDockerIgnore(dockerIgnore);

    for (const path of [...requiredDockerBuildInputs, ...safeDockerContextPaths]) {
      expect(dockerContextPathIsExcluded(path, rules), path).toBe(false);
    }

    expect(runDockerContextCheck(process.cwd())).toEqual({
      excludedPathCount: sensitiveDockerContextPaths.length,
      requiredInputCount: requiredDockerBuildInputs.length
    });
  });

  it("reports a missing secret rule and an over-broad build-input exclusion", () => {
    const missingEnvRule = dockerIgnore.replace(/^\.env$/m, "");
    expect(validateDockerIgnore(missingEnvRule)).toContain(
      "Sensitive or generated Docker context path is not excluded: .env"
    );

    expect(validateDockerIgnore(`${dockerIgnore}\napp\n`)).toContain(
      "Required Docker context path is excluded: app"
    );
  });
});
