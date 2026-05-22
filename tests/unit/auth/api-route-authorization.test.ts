import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mutatingMethods = ["POST", "PATCH", "PUT", "DELETE"] as const;
const requestBodyReaderPattern = /\brequest\s*\.\s*(?:json|formData|text|arrayBuffer|blob)\s*\(/;
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

function exportedFunctionBody(source: string, method: (typeof mutatingMethods)[number]) {
  const declaration = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`);
  const match = declaration.exec(source);
  if (match === null) {
    return "";
  }

  const signatureStart = source.indexOf("(", match.index);
  if (signatureStart === -1) {
    return "";
  }

  let parameterDepth = 0;
  let signatureEnd = -1;
  for (let index = signatureStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parameterDepth += 1;
    }
    if (char === ")") {
      parameterDepth -= 1;
    }
    if (parameterDepth === 0) {
      signatureEnd = index;
      break;
    }
  }

  if (signatureEnd === -1) {
    return "";
  }

  const bodyStart = source.indexOf("{", signatureEnd);
  if (bodyStart === -1) {
    return "";
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
    }
    if (depth === 0) {
      return source.slice(bodyStart + 1, index);
    }
  }

  return "";
}

function exportedMutatingMethodHasRoleGate(source: string, method: (typeof mutatingMethods)[number]) {
  return /\brequireApiRole\s*\(/.test(exportedFunctionBody(source, method));
}

function mutatingMethodParsesBodyBeforeRoleGate(source: string, method: (typeof mutatingMethods)[number]) {
  const body = exportedFunctionBody(source, method);
  const roleGateIndex = body.search(/\brequireApiRole\s*\(/);
  const bodyParseIndex = body.search(requestBodyReaderPattern);

  return bodyParseIndex !== -1 && (roleGateIndex === -1 || bodyParseIndex < roleGateIndex);
}

describe("API route authorization coverage", () => {
  it("keeps each local mutating API handler behind its own role check unless it uses signed webhooks", () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const missingRoleGate = routeFiles(apiRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const methods = exportedMutatingMethods(source);
      const repoPath = toRepoPath(path.relative(process.cwd(), filePath));
      if (methods.length === 0 || roleGateExceptionRoutes.has(repoPath)) {
        return [];
      }

      return methods
        .filter((method) => !exportedMutatingMethodHasRoleGate(source, method))
        .map((method) => `${method} ${repoPath}`);
    });

    expect(missingRoleGate).toEqual([]);
  });

  it("keeps local mutating API body readers behind each handler's role check", () => {
    const apiRoot = path.join(process.cwd(), "app", "api");
    const bodyParsedBeforeRoleGate = routeFiles(apiRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const methods = exportedMutatingMethods(source);
      const repoPath = toRepoPath(path.relative(process.cwd(), filePath));
      if (methods.length === 0 || roleGateExceptionRoutes.has(repoPath)) {
        return [];
      }

      return methods
        .filter((method) => mutatingMethodParsesBodyBeforeRoleGate(source, method))
        .map((method) => `${method} ${repoPath}`);
    });

    expect(bodyParsedBeforeRoleGate).toEqual([]);
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
