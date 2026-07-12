import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type DockerIgnoreRule = Readonly<{
  negated: boolean;
  pattern: string;
}>;

export const sensitiveDockerContextPaths = Object.freeze([
  ".env",
  ".env.local",
  ".env.production.local",
  ".git/HEAD",
  ".next/server/app.js",
  "node_modules/next/package.json",
  "packages/example/node_modules/example/package.json",
  "coverage/lcov.info",
  "playwright-report/index.html",
  "test-results/results.json",
  "codex-runs/run.log",
  "backups/signalstack.dump",
  "media/message-attachment.jpg",
  "uploads/import.csv",
  "runtime-data/worker-state.json",
  "data/postgres/base/1/12345",
  "debug.log",
  "logs/app.log",
  "dist/server.js",
  "tsconfig.tsbuildinfo"
] as const);

export const requiredDockerBuildInputs = Object.freeze([
  ".dockerignore",
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tsconfig.json",
  "next-env.d.ts",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "instrumentation.ts",
  "middleware.ts",
  "app",
  "components",
  "lib",
  "prisma",
  "scripts",
  "workers"
] as const);

export const safeDockerContextPaths = Object.freeze([".env.example"] as const);

function normalizeContextPath(value: string) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function parseDockerIgnore(source: string): DockerIgnoreRule[] {
  const rules: DockerIgnoreRule[] = [];

  for (const rawLine of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line === ".") {
      continue;
    }

    const negated = line.startsWith("!");
    const rawPattern = negated ? line.slice(1) : line;
    const pattern = normalizeContextPath(rawPattern);
    if (pattern) {
      rules.push({ negated, pattern });
    }
  }

  return rules;
}

function escapeRegexCharacter(character: string) {
  return /[\\^$+?.()|{}[\]]/.test(character) ? `\\${character}` : character;
}

function globToRegex(pattern: string) {
  let expression = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          expression += "(?:.*/)?";
          index += 2;
        } else {
          expression += ".*";
          index += 1;
        }
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      expression += "[^/]";
      continue;
    }

    expression += escapeRegexCharacter(character);
  }

  return new RegExp(`${expression}$`);
}

function contextPathAndParents(path: string) {
  const segments = normalizeContextPath(path).split("/").filter(Boolean);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function ruleMatchesPath(rule: DockerIgnoreRule, path: string) {
  const candidates = contextPathAndParents(path);
  const matcher = globToRegex(rule.pattern);

  if (rule.pattern.includes("/")) {
    return candidates.some((candidate) => matcher.test(candidate));
  }

  return candidates.some((candidate) => matcher.test(basename(candidate)));
}

export function dockerContextPathIsExcluded(path: string, rules: readonly DockerIgnoreRule[]) {
  let excluded = false;

  for (const rule of rules) {
    if (ruleMatchesPath(rule, path)) {
      excluded = !rule.negated;
    }
  }

  return excluded;
}

export function validateDockerIgnore(source: string) {
  const rules = parseDockerIgnore(source);
  const failures: string[] = [];

  if (rules.length === 0) {
    failures.push(".dockerignore has no active rules.");
    return failures;
  }

  for (const path of sensitiveDockerContextPaths) {
    if (!dockerContextPathIsExcluded(path, rules)) {
      failures.push(`Sensitive or generated Docker context path is not excluded: ${path}`);
    }
  }

  for (const path of [...requiredDockerBuildInputs, ...safeDockerContextPaths]) {
    if (dockerContextPathIsExcluded(path, rules)) {
      failures.push(`Required Docker context path is excluded: ${path}`);
    }
  }

  return failures;
}

export function runDockerContextCheck(root = process.cwd()) {
  const dockerIgnorePath = join(root, ".dockerignore");
  if (!existsSync(dockerIgnorePath)) {
    throw new Error("Docker context check failed:\n- .dockerignore is missing.");
  }

  const failures = validateDockerIgnore(readFileSync(dockerIgnorePath, "utf8"));
  for (const input of requiredDockerBuildInputs) {
    if (!existsSync(join(root, input))) {
      failures.push(`Required Docker build input is missing: ${input}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Docker context check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  }

  return {
    excludedPathCount: sensitiveDockerContextPaths.length,
    requiredInputCount: requiredDockerBuildInputs.length
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runDockerContextCheck();
    console.log(
      `Docker context check passed: ${result.excludedPathCount} sensitive/generated paths excluded; ${result.requiredInputCount} build inputs retained.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Docker context check failed.");
    process.exitCode = 1;
  }
}
