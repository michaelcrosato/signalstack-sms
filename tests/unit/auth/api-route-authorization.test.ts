import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mutatingMethods = ["POST", "PATCH", "PUT", "DELETE"] as const;
const roleGateExceptionRoutes = new Set([
  "app/api/webhooks/twilio/inbound/route.ts",
  "app/api/webhooks/twilio/status/route.ts"
]);

function toRepoPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return routeFiles(entryPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function exportedMutatingMethods(source: string) {
  return mutatingMethods.filter((method) =>
    new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(source)
  );
}

describe("API route authorization coverage", () => {
  it("keeps local mutating API routes behind role checks unless they use signed webhooks", () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const missingRoleGate = routeFiles(apiRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const methods = exportedMutatingMethods(source);
      const repoPath = toRepoPath(path.relative(process.cwd(), filePath));
      if (methods.length === 0 || roleGateExceptionRoutes.has(repoPath)) {
        return [];
      }

      return source.includes("requireApiRole")
        ? []
        : methods.map((method) => `${method} ${repoPath}`);
    });

    expect(missingRoleGate).toEqual([]);
  });

  it("keeps role-gate exceptions limited to signed Twilio webhook handlers", () => {
    const exceptionDetails = [...roleGateExceptionRoutes].map((repoPath) => {
      const source = readFileSync(path.join(process.cwd(), ...repoPath.split("/")), "utf8");
      return {
        repoPath,
        methods: exportedMutatingMethods(source),
        validatesTwilioSignature: source.includes("validateTwilioSignature")
      };
    });

    expect(exceptionDetails).toEqual([
      {
        repoPath: "app/api/webhooks/twilio/inbound/route.ts",
        methods: ["POST"],
        validatesTwilioSignature: true
      },
      {
        repoPath: "app/api/webhooks/twilio/status/route.ts",
        methods: ["POST"],
        validatesTwilioSignature: true
      }
    ]);
  });
});
