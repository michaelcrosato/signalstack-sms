import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mutatingMethods = ["POST", "PATCH", "PUT", "DELETE"] as const;
const defaultRequestParameterName = "request";
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

function exportedFunctionFirstParameterName(source: string, method: (typeof mutatingMethods)[number]) {
  const declaration = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`);
  const match = declaration.exec(source);
  if (match === null) {
    return defaultRequestParameterName;
  }

  const signatureStart = source.indexOf("(", match.index);
  if (signatureStart === -1) {
    return defaultRequestParameterName;
  }

  const firstParameterMatch = /\(\s*([A-Za-z_$][\w$]*)\b/.exec(source.slice(signatureStart));
  return firstParameterMatch?.[1] ?? defaultRequestParameterName;
}

function exportedMutatingMethodHasRoleGate(source: string, method: (typeof mutatingMethods)[number]) {
  return /\brequireApiRole\s*\(/.test(exportedFunctionBody(source, method));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bodySliceParsesRequestBody(bodySlice: string, requestParameterName = defaultRequestParameterName) {
  const normalizedBodySlice = bodySlice
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\.\s*clone\s*\(\s*\)\s*\)/g, "$1.clone()")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)/g, "$1");
  const escapedRequestParameterName = escapeRegExp(requestParameterName);
  const requestBodyReaderPattern = new RegExp(
    `\\b${escapedRequestParameterName}\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:json|formData|text|arrayBuffer|blob)\\s*\\(`
  );
  if (requestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }

  const requestCloneAliasPattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;\\n]+)?=\\s*${escapedRequestParameterName}\\s*\\.\\s*clone\\s*\\(\\s*\\)\\s*(?:;|\\r?\\n)`,
    "g"
  );
  requestCloneAliasPattern.lastIndex = 0;
  const cloneAliases = [...normalizedBodySlice.matchAll(requestCloneAliasPattern)].map((match) => match[1]);
  return cloneAliases.some((alias) =>
    new RegExp(`\\b${escapeRegExp(alias)}\\s*\\.\\s*(?:json|formData|text|arrayBuffer|blob)\\s*\\(`).test(
      normalizedBodySlice
    )
  );
}

function mutatingMethodParsesBodyBeforeRoleGate(source: string, method: (typeof mutatingMethods)[number]) {
  const body = exportedFunctionBody(source, method);
  const requestParameterName = exportedFunctionFirstParameterName(source, method);
  const roleGateIndex = body.search(/\brequireApiRole\s*\(/);
  const bodySliceBeforeRoleGate = roleGateIndex === -1 ? body : body.slice(0, roleGateIndex);

  return bodySliceParsesRequestBody(bodySliceBeforeRoleGate, requestParameterName);
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

  it("treats cloned request body readers as body parsing for role-gate ordering", () => {
    const unsafeSource = `
      export async function POST(request: Request) {
        const payload = await request.clone().json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function POST(request: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await request.clone().json();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats aliased cloned request body readers as body parsing for role-gate ordering", () => {
    const unsafeSource = `
      export async function PATCH(request: Request) {
        const cloned = request.clone();
        const payload = await cloned.formData();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function PATCH(request: Request) {
        const cloned = request.clone();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await cloned.formData();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "PATCH")).toBe(false);
  });

  it("treats typed cloned request aliases as body parsing for role-gate ordering", () => {
    const unsafeSource = `
      export async function PUT(request: Request) {
        const cloned: Request = request.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function PUT(request: Request) {
        const cloned: Request = request.clone();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await cloned.text();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "PUT")).toBe(false);
  });

  it("tracks body readers when handlers use non-default request parameter names", () => {
    const unsafeSource = `
      export async function DELETE(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.arrayBuffer();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function DELETE(req: Request) {
        const cloned = req.clone();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await cloned.arrayBuffer();
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("treats semicolonless cloned request aliases as body parsing for role-gate ordering", () => {
    const unsafeSource = `
      export async function POST(req: Request) {
        const cloned = req.clone()
        const payload = await cloned.blob();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const cloned = req.clone()
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await cloned.blob();
        return Response.json({ size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats parenthesized request and clone body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function PATCH(req: Request) {
        const payload = await (req.clone()).json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAliasSource = `
      export async function PATCH(req: Request) {
        const cloned = (req.clone());
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function PATCH(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await (req.clone()).json();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "PATCH")).toBe(false);
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
