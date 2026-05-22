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
  return topLevelRoleGateIndex(exportedFunctionBody(source, method)) !== -1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bodySliceParsesRequestBody(bodySlice: string, requestParameterName = defaultRequestParameterName) {
  const requestBodyReaderNames = "json|formData|text|arrayBuffer|blob";
  const maskedBodySlice = maskNonCodeTokens(bodySlice);
  const normalizedBodySlice = maskNonCodeTokens(bodySlice
    .replace(/\?\.\s*\[/g, "[")
    .replace(new RegExp(`\\[\\s*["'](${requestBodyReaderNames})["']\\s*\\]`, "g"), ".$1")
    .replace(/\[\s*["']clone["']\s*\]/g, ".clone")
    .replace(/\.\s*clone\s*\?\.\s*\(/g, ".clone(")
    .replace(new RegExp(`\\.\\s*(${requestBodyReaderNames})\\s*\\?\\.\\s*\\(`, "g"), ".$1(")
    .replace(/\?\.\s*/g, ".")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\.\s*clone\s*\(\s*\)\s*\)/g, "$1.clone()")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)/g, "$1"));
  const requestAliases = new Set([requestParameterName]);
  let discoveredRequestAlias = true;
  while (discoveredRequestAlias) {
    discoveredRequestAlias = false;
    const requestSourcePattern = [...requestAliases].map(escapeRegExp).join("|");
    const requestAliasPattern = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;\\n]+)?=\\s*(?:${requestSourcePattern})\\s*(?:;|\\r?\\n)`,
      "g"
    );
    for (const match of normalizedBodySlice.matchAll(requestAliasPattern)) {
      if (!requestAliases.has(match[1])) {
        requestAliases.add(match[1]);
        discoveredRequestAlias = true;
      }
    }
  }
  const requestSourcePattern = [...requestAliases].map(escapeRegExp).join("|");
  const requestBodyReaderPattern = new RegExp(
    `\\b(?:${requestSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\(`
  );
  if (requestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }

  const requestCloneAliasPattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;\\n]+)?=\\s*(?:${requestSourcePattern})\\s*\\.\\s*clone\\s*\\(\\s*\\)\\s*(?:;|\\r?\\n)`,
    "g"
  );
  requestCloneAliasPattern.lastIndex = 0;
  const cloneAliases = [...normalizedBodySlice.matchAll(requestCloneAliasPattern)].map((match) => match[1]);
  if (
    cloneAliases.some((alias) =>
      new RegExp(`\\b${escapeRegExp(alias)}\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\(`).test(normalizedBodySlice)
    )
  ) {
    return true;
  }

  const readerSourcePattern = [...requestAliases, ...cloneAliases].map(escapeRegExp).join("|");
  const boundReaderMethodPattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;\\n]+)?\\s*=\\s*(?:${readerSourcePattern})\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\([^)]*\\)\\s*(?:;|\\r?\\n)[\\s\\S]*?\\b\\1\\s*\\(`
  );
  if (boundReaderMethodPattern.test(maskedBodySlice)) {
    return true;
  }
  const readerMethodAliasPattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;\\n]+)?=\\s*(?:${readerSourcePattern})\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*(?:;|\\r?\\n)`,
    "g"
  );
  const readerMethodAliases = [...normalizedBodySlice.matchAll(readerMethodAliasPattern)].map((match) => match[1]);
  if (
    readerMethodAliases.some((alias) =>
      new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`).test(maskedBodySlice)
    )
  ) {
    return true;
  }

  const destructuredReaderAliasPattern = new RegExp(
    `\\b(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*(?:(?:${readerSourcePattern})|(?:${requestSourcePattern})\\s*\\.\\s*clone\\s*\\(\\s*\\))\\s*(?:;|\\r?\\n)`,
    "g"
  );
  const destructuredAliases = [...normalizedBodySlice.matchAll(destructuredReaderAliasPattern)].flatMap((match) =>
    match[1].split(",").flatMap((field) => {
      const fieldMatch = new RegExp(`^\\s*(${requestBodyReaderNames})\\s*(?::\\s*([A-Za-z_$][\\w$]*))?\\s*$`).exec(
        field
      );
      if (fieldMatch === null) {
        return [];
      }
      return [fieldMatch[2] ?? fieldMatch[1]];
    })
  );

  return destructuredAliases.some((alias) =>
    new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`).test(maskedBodySlice)
  );
}

function maskNonCodeTokens(source: string) {
  let masked = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (char === "/" && nextChar === "/") {
      masked += "  ";
      index += 1;
      while (index + 1 < source.length && source[index + 1] !== "\n") {
        masked += " ";
        index += 1;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      masked += "  ";
      index += 1;
      while (index + 1 < source.length) {
        const commentChar = source[index + 1];
        masked += commentChar === "\n" ? "\n" : " ";
        index += 1;
        if (source[index] === "*" && source[index + 1] === "/") {
          masked += " ";
          index += 1;
          break;
        }
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      const quote = char;
      masked += " ";
      while (index + 1 < source.length) {
        index += 1;
        const stringChar = source[index];
        masked += stringChar === "\n" ? "\n" : " ";
        if (stringChar === "\\") {
          if (index + 1 < source.length) {
            index += 1;
            masked += source[index] === "\n" ? "\n" : " ";
          }
          continue;
        }
        if (stringChar === quote) {
          break;
        }
      }
      continue;
    }

    masked += char;
  }

  return masked;
}

function topLevelRoleGateIndex(body: string) {
  const maskedBody = maskNonCodeTokens(body);
  let blockDepth = 0;
  for (let index = 0; index < maskedBody.length; index += 1) {
    const char = maskedBody[index];
    if (char === "{") {
      blockDepth += 1;
      continue;
    }
    if (char === "}") {
      blockDepth = Math.max(0, blockDepth - 1);
      continue;
    }
    if (blockDepth === 0 && /^\brequireApiRole\s*\(/.test(maskedBody.slice(index))) {
      return index;
    }
  }

  return -1;
}

function mutatingMethodParsesBodyBeforeRoleGate(source: string, method: (typeof mutatingMethods)[number]) {
  const body = exportedFunctionBody(source, method);
  const requestParameterName = exportedFunctionFirstParameterName(source, method);
  const roleGateIndex = topLevelRoleGateIndex(body);
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

  it("treats aliased request object body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const bodySource = req;
        const payload = await bodySource.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneAliasSource = `
      export async function POST(req: Request) {
        const bodySource = req;
        const cloned = bodySource.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const bodySource = req;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await bodySource.formData();
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
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

  it("treats bracket-notation request and clone body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const payload = await req["json"]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function POST(req: Request) {
        const payload = await req["clone"]()["text"]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAliasSource = `
      export async function POST(req: Request) {
        const cloned = req["clone"]();
        const payload = await cloned["formData"]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req["json"]();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats optional-chained request and clone body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function PATCH(req: Request) {
        const payload = await req?.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function PATCH(req: Request) {
        const payload = await req?.clone()?.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAliasSource = `
      export async function PATCH(req: Request) {
        const cloned = req?.["clone"]?.();
        const payload = await cloned?.["formData"]?.();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function PATCH(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req?.json();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "PATCH")).toBe(false);
  });

  it("treats destructured request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const { json } = req;
        const payload = await json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAliasSource = `
      export async function POST(req: Request) {
        const { text: readText } = req;
        const payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const { formData: readFormData } = req;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readFormData.call(req);
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats destructured cloned request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function PATCH(req: Request) {
        const { json } = req.clone();
        const payload = await json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAliasSource = `
      export async function PATCH(req: Request) {
        const { text: readText } = req?.["clone"]?.();
        const payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function PATCH(req: Request) {
        const { formData: readFormData } = req.clone();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readFormData.call(req);
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "PATCH")).toBe(false);
  });

  it("treats detached request body reader aliases as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const readJson = req.json;
        const payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneAliasSource = `
      export async function POST(req: Request) {
        const cloned = req.clone();
        const { text: readText } = cloned;
        const payload = await readText.call(cloned);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const cloned = req.clone();
        const readFormData = cloned.formData;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readFormData.call(cloned);
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bound request body reader aliases as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const readJson = req.json.bind(req);
        const payload = await readJson();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneAliasSource = `
      export async function POST(req: Request) {
        const cloned = req.clone();
        const readText = cloned.text.bind(cloned);
        const payload = await readText();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readFormData = req.formData.bind(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readFormData();
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("ignores comment and string mentions of requireApiRole before body-reader ordering checks", () => {
    const unsafeCommentSource = `
      export async function POST(req: Request) {
        // requireApiRole(currentOrg, MembershipRole.ADMIN);
        const payload = await req.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeStringSource = `
      export async function POST(req: Request) {
        const marker = "requireApiRole(currentOrg, MembershipRole.ADMIN)";
        const payload = await req.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ marker, payload });
      }
    `;
    const unsafeTemplateSource = `
      export async function POST(req: Request) {
        const marker = \`requireApiRole(currentOrg, MembershipRole.ADMIN)\`;
        const payload = await req.formData();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ marker, payload });
      }
    `;
    const unsafeBlockCommentSource = `
      export async function POST(req: Request) {
        /*
          requireApiRole(currentOrg, MembershipRole.ADMIN);
        */
        const payload = await req.clone().arrayBuffer();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const marker = "requireApiRole(currentOrg, MembershipRole.ADMIN)";
        const payload = await req.json();
        return Response.json({ marker, payload });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCommentSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeStringSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBlockCommentSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("ignores nested helper mentions of requireApiRole before body-reader ordering checks", () => {
    const unsafeFunctionSource = `
      export async function POST(req: Request) {
        function nestedGuard() {
          return requireApiRole(currentOrg, MembershipRole.ADMIN);
        }
        const payload = await req.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload, nestedGuard });
      }
    `;
    const unsafeArrowSource = `
      export async function PATCH(req: Request) {
        const nestedGuard = () => {
          return requireApiRole(currentOrg, MembershipRole.ADMIN);
        };
        const payload = await req.clone().text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload, nestedGuard });
      }
    `;
    const missingTopLevelGateSource = `
      export async function PUT(req: Request) {
        function nestedGuard() {
          return requireApiRole(currentOrg, MembershipRole.ADMIN);
        }
        return Response.json({ ok: true, nestedGuard });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        function nestedGuard() {
          return requireApiRole(currentOrg, MembershipRole.ADMIN);
        }
        const payload = await req.json();
        return Response.json({ payload, nestedGuard });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeFunctionSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeArrowSource, "PATCH")).toBe(true);
    expect(exportedMutatingMethodHasRoleGate(missingTopLevelGateSource, "PUT")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("ignores comment and string mentions of request body readers before role-gate ordering checks", () => {
    const safeCommentSource = `
      export async function POST(req: Request) {
        // const payload = await req.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: true });
      }
    `;
    const safeStringSource = `
      export async function POST(req: Request) {
        const sample = "await req.clone().text()";
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ sample });
      }
    `;
    const safeTemplateSource = `
      export async function POST(req: Request) {
        const sample = \`await req["formData"]()\`;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ sample });
      }
    `;
    const unsafeSource = `
      export async function POST(req: Request) {
        const payload = await req.blob();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(safeCommentSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeStringSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeTemplateSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "POST")).toBe(true);
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
