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
  const maskedSource = maskNonCodeTokens(source);
  return mutatingMethods.filter((method) =>
    new RegExp(
      `export\\s+(?:(?:async\\s+)?function\\s+${method}\\b|const\\s+${method}\\b(?:\\s*:[\\s\\S]*?)?\\s*=\\s*(?:async\\s+)?(?:function\\b)?)`
    ).test(maskedSource) || exportedHandlerLocalName(source, method) !== null
  );
}

function exportedHandlerLocalName(source: string, method: (typeof mutatingMethods)[number]) {
  const maskedSource = maskNonCodeTokens(source);
  const namedExportPattern = /export\s*\{([^}]+)\}/g;
  for (const match of maskedSource.matchAll(namedExportPattern)) {
    const exportedNames = match[1].split(",");
    for (const exportedName of exportedNames) {
      const aliasMatch = /^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(exportedName);
      if (aliasMatch !== null && aliasMatch[2] === method) {
        return aliasMatch[1];
      }

      const directMatch = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(exportedName);
      if (directMatch !== null && directMatch[1] === method) {
        return directMatch[1];
      }
    }
  }

  return null;
}

function exportedHandlerSignatureStart(source: string, method: (typeof mutatingMethods)[number]) {
  const maskedSource = maskNonCodeTokens(source);
  const functionDeclaration = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
  const functionMatch = functionDeclaration.exec(maskedSource);
  if (functionMatch !== null) {
    return source.indexOf("(", functionMatch.index);
  }

  const constDeclaration = new RegExp(
    `export\\s+const\\s+${method}\\b(?:\\s*:[\\s\\S]*?)?\\s*=\\s*(?:async\\s+)?(?:function\\b\\s*)?`
  );
  const constMatch = constDeclaration.exec(maskedSource);
  if (constMatch === null) {
    const localHandlerName = exportedHandlerLocalName(source, method);
    if (localHandlerName === null) {
      return -1;
    }

    const localFunctionDeclaration = new RegExp(`(?:^|[\\r\\n;])\\s*(?:async\\s+)?function\\s+${localHandlerName}\\b`);
    const localFunctionMatch = localFunctionDeclaration.exec(maskedSource);
    if (localFunctionMatch !== null) {
      return source.indexOf("(", localFunctionMatch.index);
    }

    const localConstDeclaration = new RegExp(
      `(?:^|[\\r\\n;])\\s*const\\s+${localHandlerName}\\b(?:\\s*:[\\s\\S]*?)?\\s*=\\s*(?:async\\s+)?(?:function\\b\\s*)?`
    );
    const localConstMatch = localConstDeclaration.exec(maskedSource);
    if (localConstMatch === null) {
      return -1;
    }

    return constHandlerParameterStart(source, localConstMatch.index + localConstMatch[0].length, localConstMatch[0]);
  }

  return constHandlerParameterStart(source, constMatch.index + constMatch[0].length, constMatch[0]);
}

function constHandlerParameterStart(source: string, searchStart: number, declarationPrefix: string) {
  if (/=\s*$/.test(declarationPrefix)) {
    const parenthesizedHandlerPrefix = /^\s*\(\s*(?:async\s+)?(?:function\b\s*(?:[A-Za-z_$][\w$]*\s*)?)?/.exec(
      source.slice(searchStart)
    );
    if (parenthesizedHandlerPrefix !== null) {
      return source.indexOf("(", searchStart + parenthesizedHandlerPrefix[0].length);
    }
  }

  return source.indexOf("(", searchStart);
}

function exportedFunctionBody(source: string, method: (typeof mutatingMethods)[number]) {
  const signatureStart = exportedHandlerSignatureStart(source, method);
  if (signatureStart === -1) {
    return "";
  }

  const maskedSource = maskNonCodeTokens(source);
  let parameterDepth = 0;
  let signatureEnd = -1;
  for (let index = signatureStart; index < source.length; index += 1) {
    const char = maskedSource[index];
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

  const bodyStart = maskedSource.indexOf("{", signatureEnd);
  if (bodyStart === -1) {
    return "";
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = maskedSource[index];
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
  const signatureStart = exportedHandlerSignatureStart(source, method);
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

function bodySliceParsesRequestBody(rawBodySlice: string, requestParameterName = defaultRequestParameterName) {
  let normalizedGlobalThisBodySlice = rawBodySlice;
  let previousGlobalThisBodySlice: string;
  do {
    previousGlobalThisBodySlice = normalizedGlobalThisBodySlice;
    normalizedGlobalThisBodySlice = normalizedGlobalThisBodySlice
      .replace(/\(\s*globalThis\s*\)/g, "globalThis")
      .replace(/\(\s*(Object|Reflect|Request)\s*\)/g, "$1")
      .replace(/\b(Object|Reflect|Request|globalThis)\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\))/g, "$1");
    normalizedGlobalThisBodySlice = normalizedGlobalThisBodySlice
      .replace(/\(\s*(globalThis\s*(?:\.|\?\.)\s*Request)\s*\)/g, "$1")
      .replace(/\(\s*(globalThis\s*(?:\?\.)?\[\s*["'`]Request["'`]\s*\])\s*\)/g, "$1")
      .replace(/\(\s*(Request\s*(?:\.|\?\.)\s*prototype)\s*\)/g, "$1")
      .replace(/\(\s*(Request\s*(?:\?\.)?\[\s*["'`]prototype["'`]\s*\])\s*\)/g, "$1")
      .replace(/(\bglobalThis\s*(?:\.|\?\.)\s*Request)\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\))/g, "$1")
      .replace(/(\bglobalThis\s*(?:\?\.)?\[\s*["'`]Request["'`]\s*\])\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\))/g, "$1")
      .replace(/(\bRequest\s*(?:\.|\?\.)\s*prototype)\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\))/g, "$1")
      .replace(/(\bRequest\s*(?:\?\.)?\[\s*["'`]prototype["'`]\s*\])\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\))/g, "$1");
  } while (normalizedGlobalThisBodySlice !== previousGlobalThisBodySlice);

  const builtInPropertyAliases = new Map<string, string>();
  const globalThisAliases = new Set<string>();
  const globalThisAliasPattern =
    /(?:\b(?:const|let|var)\s+|,\s*)([A-Za-z_$][\w$]*)\s*(?::[^=;,\n]+)?=\s*\(*\s*globalThis(?:\s+(?:as|satisfies)\s+typeof\s+globalThis)?\s*\)*\s*(?=,|;|\r?\n)/g;
  const assignedGlobalThisAliasPattern =
    /(?:^|[;\r\n])\s*([A-Za-z_$][\w$]*)\s*=\s*\(*\s*globalThis(?:\s+(?:as|satisfies)\s+typeof\s+globalThis)?\s*\)*\s*(?=;|\r?\n)/g;
  for (const match of [
    ...normalizedGlobalThisBodySlice.matchAll(globalThisAliasPattern),
    ...normalizedGlobalThisBodySlice.matchAll(assignedGlobalThisAliasPattern)
  ]) {
    globalThisAliases.add(match[1]);
  }
  for (const alias of globalThisAliases) {
    let previousAliasBodySlice: string;
    do {
      previousAliasBodySlice = normalizedGlobalThisBodySlice;
      normalizedGlobalThisBodySlice = normalizedGlobalThisBodySlice.replace(
        new RegExp(`\\(\\s*${escapeRegExp(alias)}\\s*\\)`, "g"),
        alias
      );
    } while (normalizedGlobalThisBodySlice !== previousAliasBodySlice);
  }
  const literalBuiltInNamePattern = String.raw`\(?\s*["'\`](Object|Reflect)["'\`]\s*(?:\)?\s+as\s+const\s*\)?|\)?)`;
  const requestBodyReaderNames = "json|formData|text|arrayBuffer|blob";
  const simpleCallArguments = "(?:[^()]|\\([^()]*\\))*";
  const variableDeclaratorStart = "(?:\\b(?:const|let|var)\\s+|,\\s*)";
  const variableDeclaratorTerminator = "(?:,|;|\\r?\\n)";
  const variableDeclaratorEnd = `\\s*(?=${variableDeclaratorTerminator})`;
  const builtInPropertyAliasPattern = new RegExp(
    `(?:\\b(?:const|let|var)\\s+|,\\s*)([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${literalBuiltInNamePattern}\\s*(?=,|;|\\r?\\n)`,
    "g"
  );
  const assignedBuiltInPropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${literalBuiltInNamePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...normalizedGlobalThisBodySlice.matchAll(builtInPropertyAliasPattern),
    ...normalizedGlobalThisBodySlice.matchAll(assignedBuiltInPropertyAliasPattern)
  ]) {
    builtInPropertyAliases.set(match[1], match[2]);
  }
  const globalThisTargetPattern = () =>
    `(?:globalThis${globalThisAliases.size > 0 ? `|${[...globalThisAliases].map(escapeRegExp).join("|")}` : ""})`;
  const collectGlobalThisBuiltInAliases = (fields: string) =>
    fields.split(",").flatMap((field) => {
      const fieldMatch = /^\s*(Object|Reflect)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(field);
      if (fieldMatch !== null) {
        return [[fieldMatch[2] ?? fieldMatch[1], fieldMatch[1]]] as const;
      }

      const computedLiteralMatch = /^\s*\[\s*["'`](Object|Reflect)["'`]\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      if (computedLiteralMatch !== null) {
        return [[computedLiteralMatch[2], computedLiteralMatch[1]]] as const;
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      const builtInName = computedAliasMatch === null ? undefined : builtInPropertyAliases.get(computedAliasMatch[1]);
      return builtInName === undefined || computedAliasMatch === null ? [] : ([[computedAliasMatch[2], builtInName]] as const);
    });
  const builtInObjectAliases = new Map<string, string>();
  const destructuredGlobalThisBuiltInAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetPattern()}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredGlobalThisBuiltInAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${globalThisTargetPattern()}\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const directBuiltInObjectAliasPattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*\\(*\\s*(Object|Reflect)(?:\\s+(?:as|satisfies)\\s+typeof\\s+(?:Object|Reflect))?\\s*\\)*${variableDeclaratorEnd}`,
    "g"
  );
  const assignedBuiltInObjectAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*\\(*\\s*(Object|Reflect)(?:\\s+(?:as|satisfies)\\s+typeof\\s+(?:Object|Reflect))?\\s*\\)*\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...normalizedGlobalThisBodySlice.matchAll(directBuiltInObjectAliasPattern),
    ...normalizedGlobalThisBodySlice.matchAll(assignedBuiltInObjectAliasPattern)
  ]) {
    builtInObjectAliases.set(match[1], match[2]);
  }
  for (const match of [
    ...normalizedGlobalThisBodySlice.matchAll(destructuredGlobalThisBuiltInAliasPattern),
    ...normalizedGlobalThisBodySlice.matchAll(assignedDestructuredGlobalThisBuiltInAliasPattern)
  ]) {
    for (const [alias, builtInName] of collectGlobalThisBuiltInAliases(match[1])) {
      builtInObjectAliases.set(alias, builtInName);
    }
  }

  let bodySlice = normalizedGlobalThisBodySlice
    .replace(/\(\s*globalThis\s*\)\s*(?:\?\.)?\[\s*["'`](Object|Reflect)["'`]\s*\]/g, "$1")
    .replace(/\(\s*globalThis\s*\)\s*\??\.\s*(Object|Reflect)\b/g, "$1")
    .replace(/\bglobalThis\s*\?\.\s*(Object|Reflect)\b/g, "$1")
    .replace(/\bglobalThis\s*\.\s*(Object|Reflect)\b/g, "$1")
    .replace(/\bglobalThis\s*(?:\?\.)?\[\s*["'`](Object|Reflect)["'`]\s*\]/g, "$1");
  for (const alias of globalThisAliases) {
    bodySlice = bodySlice
      .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\?\\.)?\\[\\s*["'\`](Object|Reflect)["'\`]\\s*\\]`, "g"), "$1")
      .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*\\??\\.\\s*(Object|Reflect)\\b`, "g"), "$1");
    for (const [builtInAlias, builtInName] of builtInPropertyAliases) {
      bodySlice = bodySlice.replace(
        new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\?\\.)?\\[\\s*${escapeRegExp(builtInAlias)}\\s*\\]`, "g"),
        builtInName
      );
    }
  }
  for (const [alias, builtInName] of builtInPropertyAliases) {
    bodySlice = bodySlice.replace(
      new RegExp(`\\bglobalThis\\s*(?:\\?\\.)?\\[\\s*${escapeRegExp(alias)}\\s*\\]`, "g"),
      builtInName
    );
  }
  for (const [alias, builtInName] of builtInObjectAliases) {
    bodySlice = bodySlice.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), builtInName);
  }
  const requestConstructorPropertyAliases = new Set<string>();
  const literalRequestConstructorNamePattern = String.raw`\(?\s*["'\`]Request["'\`]\s*(?:\)?\s+as\s+const\s*\)?|\)?)`;
  const requestConstructorPropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${literalRequestConstructorNamePattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedRequestConstructorPropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${literalRequestConstructorNamePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(requestConstructorPropertyAliasPattern),
    ...bodySlice.matchAll(assignedRequestConstructorPropertyAliasPattern)
  ]) {
    requestConstructorPropertyAliases.add(match[1]);
  }
  const requestConstructorPropertyPattern = () =>
    `(?:${literalRequestConstructorNamePattern}${
      requestConstructorPropertyAliases.size > 0
        ? `|${[...requestConstructorPropertyAliases].map(escapeRegExp).join("|")}`
        : ""
    })`;
  const requestConstructorAliases = new Set<string>();
  const directRequestConstructorAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*\\(?\\s*Request\\s*\\)?(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request)?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDirectRequestConstructorAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*\\(?\\s*Request\\s*\\)?(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request)?\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const requestConstructorAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetPattern()}\\s*(?:(?:\\.|\\?\\.)\\s*Request|(?:\\?\\.)?\\[\\s*${requestConstructorPropertyPattern()}\\s*\\])(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request)?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedRequestConstructorAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${globalThisTargetPattern()}\\s*(?:(?:\\.|\\?\\.)\\s*Request|(?:\\?\\.)?\\[\\s*${requestConstructorPropertyPattern()}\\s*\\])(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request)?\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const collectGlobalThisRequestAliases = (fields: string) =>
    fields.split(",").flatMap((field) => {
      const fieldMatch = /^\s*Request\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(field);
      if (fieldMatch !== null) {
        return [fieldMatch[1] ?? "Request"];
      }

      const computedLiteralMatch = /^\s*\[\s*["'`]Request["'`]\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      if (computedLiteralMatch !== null) {
        return [computedLiteralMatch[1]];
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      return computedAliasMatch !== null && requestConstructorPropertyAliases.has(computedAliasMatch[1])
        ? [computedAliasMatch[2]]
        : [];
    });
  const destructuredGlobalThisRequestAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetPattern()}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredGlobalThisRequestAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${globalThisTargetPattern()}\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(directRequestConstructorAliasPattern),
    ...bodySlice.matchAll(assignedDirectRequestConstructorAliasPattern),
    ...bodySlice.matchAll(requestConstructorAliasPattern),
    ...bodySlice.matchAll(assignedRequestConstructorAliasPattern)
  ]) {
    requestConstructorAliases.add(match[1]);
  }
  for (const match of [
    ...bodySlice.matchAll(destructuredGlobalThisRequestAliasPattern),
    ...bodySlice.matchAll(assignedDestructuredGlobalThisRequestAliasPattern)
  ]) {
    for (const alias of collectGlobalThisRequestAliases(match[1])) {
      requestConstructorAliases.add(alias);
    }
  }
  for (const alias of requestConstructorAliases) {
    bodySlice = bodySlice
      .replace(
        new RegExp(
          `\\b${escapeRegExp(alias)}\\s*(?:\\?\\.)?\\[\\s*\\(?\\s*["'\`]prototype["'\`]\\s*(?:\\)?\\s+as\\s+const\\s*\\)?|\\)?)\\s*\\]`,
          "g"
        ),
        "Request.prototype"
      )
      .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*\\??\\.\\s*prototype\\b`, "g"), "Request.prototype");
  }
  const literalBodyReaderNamePattern = `\\(?\\s*["'\`](${requestBodyReaderNames})["'\`]\\s*(?:\\)?\\s+as\\s+const\\s*\\)?|\\)?)`;
  const literalRequestPrototypeNamePattern = String.raw`\(?\s*["'\`]prototype["'\`]\s*(?:\)?\s+as\s+const\s*\)?|\)?)`;
  const requestPrototypePropertyAliases = new Set<string>();
  const requestPrototypePropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${literalRequestPrototypeNamePattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedRequestPrototypePropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${literalRequestPrototypeNamePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(requestPrototypePropertyAliasPattern),
    ...bodySlice.matchAll(assignedRequestPrototypePropertyAliasPattern)
  ]) {
    requestPrototypePropertyAliases.add(match[1]);
  }
  const requestConstructorTargetPattern =
    requestConstructorAliases.size > 0
      ? `(?:Request|${[...requestConstructorAliases].map(escapeRegExp).join("|")})`
      : "Request";
  const requestPrototypeAliases = new Set<string>();
  const directRequestPrototypeAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${requestConstructorTargetPattern}\\s*(?:(?:\\.|\\?\\.)\\s*prototype|(?:\\?\\.)?\\[\\s*${literalRequestPrototypeNamePattern}\\s*\\])(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request\\s*\\.\\s*prototype)?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedRequestPrototypeAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${requestConstructorTargetPattern}\\s*(?:(?:\\.|\\?\\.)\\s*prototype|(?:\\?\\.)?\\[\\s*${literalRequestPrototypeNamePattern}\\s*\\])(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request\\s*\\.\\s*prototype)?\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const collectRequestPrototypeDestructuringAliases = (fields: string) =>
    fields.split(",").flatMap((field) => {
      const fieldMatch = /^\s*prototype\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(field);
      if (fieldMatch !== null) {
        return [fieldMatch[1] ?? "prototype"];
      }

      const computedLiteralMatch = /^\s*\[\s*["'`]prototype["'`]\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      if (computedLiteralMatch !== null) {
        return [computedLiteralMatch[1]];
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      return computedAliasMatch !== null && requestPrototypePropertyAliases.has(computedAliasMatch[1])
        ? [computedAliasMatch[2]]
        : [];
    });
  const destructuredRequestPrototypeAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${requestConstructorTargetPattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredRequestPrototypeAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${requestConstructorTargetPattern}\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(directRequestPrototypeAliasPattern),
    ...bodySlice.matchAll(assignedRequestPrototypeAliasPattern)
  ]) {
    requestPrototypeAliases.add(match[1]);
  }
  for (const match of [
    ...bodySlice.matchAll(destructuredRequestPrototypeAliasPattern),
    ...bodySlice.matchAll(assignedDestructuredRequestPrototypeAliasPattern)
  ]) {
    for (const alias of collectRequestPrototypeDestructuringAliases(match[1])) {
      requestPrototypeAliases.add(alias);
    }
  }
  for (const alias of requestPrototypeAliases) {
    bodySlice = bodySlice
      .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\?\\.)?\\[\\s*${literalBodyReaderNamePattern}\\s*\\]`, "g"), "Request.prototype.$1")
      .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*\\??\\.\\s*(${requestBodyReaderNames})\\b`, "g"), "Request.prototype.$1");
  }
  const bodyReaderPropertyAliases = new Map<string, string>();
  const bodyReaderPropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${literalBodyReaderNamePattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedBodyReaderPropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${literalBodyReaderNamePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(bodyReaderPropertyAliasPattern),
    ...bodySlice.matchAll(assignedBodyReaderPropertyAliasPattern)
  ]) {
    bodyReaderPropertyAliases.set(match[1], match[2]);
  }
  const lookupPropertyAliases = new Map<string, string>();
  const literalLookupNamePattern = String.raw`\(?\s*["'\`](getOwnPropertyDescriptor|getPrototypeOf)["'\`]\s*(?:\)?\s+as\s+const\s*\)?|\)?)`;
  const lookupPropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${literalLookupNamePattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedLookupPropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${literalLookupNamePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(lookupPropertyAliasPattern),
    ...bodySlice.matchAll(assignedLookupPropertyAliasPattern)
  ]) {
    lookupPropertyAliases.set(match[1], match[2]);
  }
  const reflectMethodPropertyAliases = new Map<string, string>();
  const literalReflectMethodNamePattern = String.raw`\(?\s*["'\`](get|apply)["'\`]\s*(?:\)?\s+as\s+const\s*\)?|\)?)`;
  const reflectMethodPropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${literalReflectMethodNamePattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedReflectMethodPropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${literalReflectMethodNamePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(reflectMethodPropertyAliasPattern),
    ...bodySlice.matchAll(assignedReflectMethodPropertyAliasPattern)
  ]) {
    reflectMethodPropertyAliases.set(match[1], match[2]);
  }
  const descriptorValueAccessPattern =
    String.raw`(?:\?\s*\.\s*(?:value|\[\s*["'\`]value["'\`]\s*\])|!\s*(?:\.\s*value|\[\s*["'\`]value["'\`]\s*\])|\.\s*value|\[\s*["'\`]value["'\`]\s*\])`;
  const lookupPropertyAliasPatternFor = (memberName: string) => {
    const aliases = [...lookupPropertyAliases.entries()]
      .filter(([, lookupName]) => lookupName === memberName)
      .map(([alias]) => escapeRegExp(alias));
    return aliases.length > 0 ? `|${aliases.join("|")}` : "";
  };
  const reflectMethodPropertyAliasPatternFor = (memberName: string) => {
    const aliases = [...reflectMethodPropertyAliases.entries()]
      .filter(([, methodName]) => methodName === memberName)
      .map(([alias]) => escapeRegExp(alias));
    return aliases.length > 0 ? `|${aliases.join("|")}` : "";
  };
  const objectOrReflectMemberPattern = (memberName: string) =>
    String.raw`(?:Object|Reflect)\s*(?:(?:\.|\?\.)\s*${memberName}|(?:\?\.)?\[\s*(?:["'\`]${memberName}["'\`]${lookupPropertyAliasPatternFor(memberName)})\s*\])\s*(?:\?\.)?`;
  const descriptorLookupPattern = objectOrReflectMemberPattern("getOwnPropertyDescriptor");
  const prototypeLookupPattern = objectOrReflectMemberPattern("getPrototypeOf");
  const descriptorLookupAliases = new Set<string>();
  const prototypeLookupAliases = new Set<string>();
  const reflectGetAliases = new Set<string>();
  const reflectApplyAliases = new Set<string>();
  const collectLookupDestructuringAliases = (fields: string, memberName: string) =>
    fields.split(",").flatMap((field) => {
      const fieldMatch = new RegExp(`^\\s*${memberName}\\s*(?::\\s*([A-Za-z_$][\\w$]*))?\\s*$`).exec(field);
      if (fieldMatch !== null) {
        return [fieldMatch[1] ?? memberName];
      }

      const computedLiteralMatch = new RegExp(
        `^\\s*\\[\\s*["'\`]${memberName}["'\`]\\s*\\]\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*$`
      ).exec(field);
      if (computedLiteralMatch !== null) {
        return [computedLiteralMatch[1]];
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      return computedAliasMatch !== null && lookupPropertyAliases.get(computedAliasMatch[1]) === memberName
        ? [computedAliasMatch[2]]
        : [];
    });
  const collectReflectMethodDestructuringAliases = (fields: string, memberName: string) =>
    fields.split(",").flatMap((field) => {
      const fieldMatch = new RegExp(`^\\s*${memberName}\\s*(?::\\s*([A-Za-z_$][\\w$]*))?\\s*$`).exec(field);
      if (fieldMatch !== null) {
        return [fieldMatch[1] ?? memberName];
      }

      const computedLiteralMatch = new RegExp(
        `^\\s*\\[\\s*["'\`]${memberName}["'\`]\\s*\\]\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*$`
      ).exec(field);
      if (computedLiteralMatch !== null) {
        return [computedLiteralMatch[1]];
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      return computedAliasMatch !== null && reflectMethodPropertyAliases.get(computedAliasMatch[1]) === memberName
        ? [computedAliasMatch[2]]
        : [];
    });
  const descriptorLookupAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${descriptorLookupPattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDescriptorLookupAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${descriptorLookupPattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const prototypeLookupAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${prototypeLookupPattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedPrototypeLookupAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${prototypeLookupPattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const destructuredLookupAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*(?:Object|Reflect)${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredLookupAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*(?:Object|Reflect)\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const reflectGetAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*Reflect\\s*(?:(?:\\.|\\?\\.)\\s*get|(?:\\?\\.)?\\[\\s*(?:["'\`]get["'\`]${reflectMethodPropertyAliasPatternFor("get")})\\s*\\])\\s*(?:\\?\\.)?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedReflectGetAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*Reflect\\s*(?:(?:\\.|\\?\\.)\\s*get|(?:\\?\\.)?\\[\\s*(?:["'\`]get["'\`]${reflectMethodPropertyAliasPatternFor("get")})\\s*\\])\\s*(?:\\?\\.)?\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const reflectApplyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*Reflect\\s*(?:(?:\\.|\\?\\.)\\s*apply|(?:\\?\\.)?\\[\\s*(?:["'\`]apply["'\`]${reflectMethodPropertyAliasPatternFor("apply")})\\s*\\])\\s*(?:\\?\\.)?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedReflectApplyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*Reflect\\s*(?:(?:\\.|\\?\\.)\\s*apply|(?:\\?\\.)?\\[\\s*(?:["'\`]apply["'\`]${reflectMethodPropertyAliasPatternFor("apply")})\\s*\\])\\s*(?:\\?\\.)?\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const destructuredReflectAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*Reflect${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredReflectAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*Reflect\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...bodySlice.matchAll(descriptorLookupAliasPattern),
    ...bodySlice.matchAll(assignedDescriptorLookupAliasPattern)
  ]) {
    descriptorLookupAliases.add(match[1]);
  }
  for (const match of [
    ...bodySlice.matchAll(prototypeLookupAliasPattern),
    ...bodySlice.matchAll(assignedPrototypeLookupAliasPattern)
  ]) {
    prototypeLookupAliases.add(match[1]);
  }
  for (const match of [
    ...bodySlice.matchAll(destructuredLookupAliasPattern),
    ...bodySlice.matchAll(assignedDestructuredLookupAliasPattern)
  ]) {
    for (const alias of collectLookupDestructuringAliases(match[1], "getOwnPropertyDescriptor")) {
      descriptorLookupAliases.add(alias);
    }
    for (const alias of collectLookupDestructuringAliases(match[1], "getPrototypeOf")) {
      prototypeLookupAliases.add(alias);
    }
  }
  for (const match of [...bodySlice.matchAll(reflectGetAliasPattern), ...bodySlice.matchAll(assignedReflectGetAliasPattern)]) {
    reflectGetAliases.add(match[1]);
  }
  for (const match of [
    ...bodySlice.matchAll(reflectApplyAliasPattern),
    ...bodySlice.matchAll(assignedReflectApplyAliasPattern)
  ]) {
    reflectApplyAliases.add(match[1]);
  }
  for (const match of [
    ...bodySlice.matchAll(destructuredReflectAliasPattern),
    ...bodySlice.matchAll(assignedDestructuredReflectAliasPattern)
  ]) {
    for (const alias of collectReflectMethodDestructuringAliases(match[1], "get")) {
      reflectGetAliases.add(alias);
    }
    for (const alias of collectReflectMethodDestructuringAliases(match[1], "apply")) {
      reflectApplyAliases.add(alias);
    }
  }
  const descriptorLookupCallPattern = `(?:${descriptorLookupPattern}|${[...descriptorLookupAliases].map(escapeRegExp).join("|") || "(?!)"})`;
  const prototypeLookupCallPattern = `(?:${prototypeLookupPattern}|${[...prototypeLookupAliases].map(escapeRegExp).join("|") || "(?!)"})`;
  const optionalReflectGetReceiverArgument = `(?:\\s*,\\s*${simpleCallArguments})?`;
  const descriptorReaderAliases = new Map<string, string>();
  const descriptorAliasTargetPattern = String.raw`(?:Request\s*\.\s*prototype|${prototypeLookupCallPattern}\s*\(\s*([^)]*?)\s*\))`;
  const descriptorReaderAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*${literalBodyReaderNamePattern}\\s*\\)${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDescriptorReaderAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*${literalBodyReaderNamePattern}\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const descriptorPropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDescriptorPropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const descriptorAliasMatches = [
    ...bodySlice.matchAll(descriptorReaderAliasPattern),
    ...bodySlice.matchAll(assignedDescriptorReaderAliasPattern)
  ];
  for (const match of descriptorAliasMatches) {
    const descriptorAlias = match[1];
    const prototypeTarget = match[2];
    const readerName = match[3];
    descriptorReaderAliases.set(
      descriptorAlias,
      prototypeTarget === undefined ? `Request.prototype.${readerName}` : `Object.getPrototypeOf(${prototypeTarget}).${readerName}`
    );
  }
  const descriptorPropertyAliasMatches = [
    ...bodySlice.matchAll(descriptorPropertyAliasPattern),
    ...bodySlice.matchAll(assignedDescriptorPropertyAliasPattern)
  ];
  for (const match of descriptorPropertyAliasMatches) {
    const descriptorAlias = match[1];
    const prototypeTarget = match[2];
    const propertyAlias = match[3];
    const readerName = bodyReaderPropertyAliases.get(propertyAlias);
    if (readerName !== undefined) {
      descriptorReaderAliases.set(
        descriptorAlias,
        prototypeTarget === undefined
          ? `Request.prototype.${readerName}`
          : `Object.getPrototypeOf(${prototypeTarget}).${readerName}`
      );
    }
  }
  const descriptorValueReaderAliases = new Map<string, string>();
  const descriptorValueAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*${literalBodyReaderNamePattern}\\s*\\)\\s*!?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDescriptorValueAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*${literalBodyReaderNamePattern}\\s*\\)\\s*!?\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const descriptorValuePropertyAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*!?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDescriptorValuePropertyAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${descriptorLookupCallPattern}\\s*\\(\\s*${descriptorAliasTargetPattern}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*!?\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const descriptorValueAliasMatches = [
    ...bodySlice.matchAll(descriptorValueAliasPattern),
    ...bodySlice.matchAll(assignedDescriptorValueAliasPattern)
  ];
  const collectDescriptorValueAliases = (fields: string) =>
    fields.split(",").flatMap((field) => {
      const fieldMatch = /^\s*value\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(field);
      if (fieldMatch !== null) {
        return [fieldMatch[1] ?? "value"];
      }

      const computedLiteralFieldMatch = /^\s*\[\s*["'`]value["'`]\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      return computedLiteralFieldMatch !== null ? [computedLiteralFieldMatch[1]] : [];
    });
  for (const match of descriptorValueAliasMatches) {
    const fields = match[1];
    const prototypeTarget = match[2];
    const readerName = match[3];
    for (const valueAlias of collectDescriptorValueAliases(fields)) {
      descriptorValueReaderAliases.set(
        valueAlias,
        prototypeTarget === undefined ? `Request.prototype.${readerName}` : `Object.getPrototypeOf(${prototypeTarget}).${readerName}`
      );
    }
  }
  const descriptorValuePropertyAliasMatches = [
    ...bodySlice.matchAll(descriptorValuePropertyAliasPattern),
    ...bodySlice.matchAll(assignedDescriptorValuePropertyAliasPattern)
  ];
  for (const match of descriptorValuePropertyAliasMatches) {
    const fields = match[1];
    const prototypeTarget = match[2];
    const propertyAlias = match[3];
    const readerName = bodyReaderPropertyAliases.get(propertyAlias);
    if (readerName !== undefined) {
      for (const valueAlias of collectDescriptorValueAliases(fields)) {
        descriptorValueReaderAliases.set(
          valueAlias,
          prototypeTarget === undefined ? `Request.prototype.${readerName}` : `Object.getPrototypeOf(${prototypeTarget}).${readerName}`
        );
      }
    }
  }
  const reflectMethodAliasBodySlice = [...reflectGetAliases].reduce(
    (source, alias) =>
      source
        .replace(
          new RegExp(
            `\\b${escapeRegExp(alias)}\\s*\\.\\s*call\\s*\\(\\s*Reflect\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\)`,
            "g"
          ),
          "Reflect.get($1, $2)"
        )
        .replace(
          new RegExp(
            `\\b${escapeRegExp(alias)}\\s*\\.\\s*apply\\s*\\(\\s*Reflect\\s*,\\s*\\[\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\]\\s*\\)`,
            "g"
          ),
          "Reflect.get($1, $2)"
        )
        .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*\\(`, "g"), "Reflect.get("),
    [...reflectApplyAliases].reduce(
      (source, alias) =>
        source
          .replace(
            new RegExp(
              `\\b${escapeRegExp(alias)}\\s*\\.\\s*call\\s*\\(\\s*Reflect\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\)`,
              "g"
            ),
            "Reflect.apply($1, $2, $3)"
          )
          .replace(
            new RegExp(
              `\\b${escapeRegExp(alias)}\\s*\\.\\s*apply\\s*\\(\\s*Reflect\\s*,\\s*\\[\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\]\\s*\\)`,
              "g"
            ),
            "Reflect.apply($1, $2, $3)"
          )
          .replace(new RegExp(`\\b${escapeRegExp(alias)}\\s*\\(`, "g"), "Reflect.apply("),
      bodySlice
    )
  );
  const reflectedBodySlice = reflectMethodAliasBodySlice
    .replace(
      new RegExp(
        `\\bReflect\\s*\\.\\s*get\\s*\\.\\s*call\\s*\\(\\s*Reflect\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\)`,
        "g"
      ),
      "Reflect.get($1, $2)"
    )
    .replace(
      new RegExp(
        `\\bReflect\\s*\\.\\s*get\\s*\\.\\s*apply\\s*\\(\\s*Reflect\\s*,\\s*\\[\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\]\\s*\\)`,
        "g"
      ),
      "Reflect.get($1, $2)"
    )
    .replace(
      new RegExp(
        `\\bReflect\\s*\\.\\s*apply\\s*\\.\\s*call\\s*\\(\\s*Reflect\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\)`,
        "g"
      ),
      "Reflect.apply($1, $2, $3)"
    )
    .replace(
      new RegExp(
        `\\bReflect\\s*\\.\\s*apply\\s*\\.\\s*apply\\s*\\(\\s*Reflect\\s*,\\s*\\[\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*,\\s*(${simpleCallArguments})\\s*\\]\\s*\\)`,
        "g"
      ),
      "Reflect.apply($1, $2, $3)"
    )
    .replace(
      new RegExp(
        `\\b((?:${descriptorLookupCallPattern}|${prototypeLookupCallPattern}))\\s*\\.\\s*call\\s*\\(\\s*(?:Object|Reflect)\\s*,\\s*(${simpleCallArguments})\\s*\\)`,
        "g"
      ),
      "$1($2)"
    )
    .replace(
      new RegExp(
        `\\b((?:${descriptorLookupCallPattern}|${prototypeLookupCallPattern}))\\s*\\.\\s*apply\\s*\\(\\s*(?:Object|Reflect)\\s*,\\s*\\[\\s*(${simpleCallArguments})\\s*\\]\\s*\\)`,
        "g"
      ),
      "$1($2)"
    )
    .replace(/\bReflect\s*(?:\?\.\s*)?\[\s*["'`]get["'`]\s*\]\s*(?:\?\.)?\s*\(/g, "Reflect.get(")
    .replace(/\bReflect\s*(?:\?\.\s*)?\[\s*["'`]apply["'`]\s*\]\s*(?:\?\.)?\s*\(/g, "Reflect.apply(")
    .replace(/\bReflect\s*\?\.\s*get\s*\(/g, "Reflect.get(")
    .replace(/\bReflect\s*\.\s*get\s*\?\.\s*\(/g, "Reflect.get(")
    .replace(/\bReflect\s*\?\.\s*apply\s*\(/g, "Reflect.apply(")
    .replace(/\bReflect\s*\.\s*apply\s*\?\.\s*\(/g, "Reflect.apply(")
    .replace(/\?\.\s*\[/g, "[")
    .replace(
      new RegExp(`(\\bReflect\\s*\\.\\s*get\\s*\\(\\s*[^,]+?,\\s*)\\(\\s*(["'\`])(${requestBodyReaderNames})\\2\\s*\\)`, "g"),
      "$1$2$3$2"
    )
    .replace(
      new RegExp(
        `(${descriptorLookupCallPattern}\\s*\\(\\s*[^,]+?,\\s*)\\(\\s*(["'\`])(${requestBodyReaderNames})\\2\\s*\\)`,
        "g"
      ),
      "$1$2$3$2"
    )
    .replace(
      new RegExp(
        `${descriptorLookupCallPattern}\\s*\\(\\s*Request\\s*\\.\\s*prototype\\s*,\\s*["'\`](${requestBodyReaderNames})["'\`]\\s*\\)\\s*${descriptorValueAccessPattern}`,
        "g"
      ),
      "Request.prototype.$1"
    )
    .replace(
      new RegExp(
        `${descriptorLookupCallPattern}\\s*\\(\\s*Request\\s*\\.\\s*prototype\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*${descriptorValueAccessPattern}`,
        "g"
      ),
      (match, propertyAlias: string) => {
        const readerName = bodyReaderPropertyAliases.get(propertyAlias);
        return readerName === undefined ? match : `Request.prototype.${readerName}`;
      }
    )
    .replace(
      new RegExp(
        `${descriptorLookupCallPattern}\\s*\\(\\s*${prototypeLookupCallPattern}\\s*\\(\\s*([^)]*?)\\s*\\)\\s*,\\s*["'\`](${requestBodyReaderNames})["'\`]\\s*\\)\\s*${descriptorValueAccessPattern}`,
        "g"
      ),
      "Object.getPrototypeOf($1).$2"
    )
    .replace(
      new RegExp(
        `${descriptorLookupCallPattern}\\s*\\(\\s*${prototypeLookupCallPattern}\\s*\\(\\s*([^)]*?)\\s*\\)\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)\\s*${descriptorValueAccessPattern}`,
        "g"
      ),
      (match, target: string, propertyAlias: string) => {
        const readerName = bodyReaderPropertyAliases.get(propertyAlias);
        return readerName === undefined ? match : `Object.getPrototypeOf(${target}).${readerName}`;
      }
    )
    .replace(
      new RegExp(
        `Reflect\\s*\\.\\s*get\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\.\\s*clone\\s*\\(\\s*\\)\\s*,\\s*["'\`](${requestBodyReaderNames})["'\`]${optionalReflectGetReceiverArgument}\\s*\\)`,
        "g"
      ),
      "$1.clone().$2"
    )
    .replace(
      new RegExp(
        `\\bReflect\\s*\\.\\s*get\\s*\\(\\s*([^,]+?)\\s*,\\s*["'\`](${requestBodyReaderNames})["'\`]${optionalReflectGetReceiverArgument}\\s*\\)`,
        "g"
      ),
      "$1.$2"
    )
    .replace(
      new RegExp(
        `Reflect\\s*\\.\\s*get\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\.\\s*clone\\s*\\(\\s*\\)\\s*,\\s*([A-Za-z_$][\\w$]*)${optionalReflectGetReceiverArgument}\\s*\\)`,
        "g"
      ),
      (match, requestAlias: string, propertyAlias: string) => {
        const readerName = bodyReaderPropertyAliases.get(propertyAlias);
        return readerName === undefined ? match : `${requestAlias}.clone().${readerName}`;
      }
    )
    .replace(
      new RegExp(
        `\\bReflect\\s*\\.\\s*get\\s*\\(\\s*([^,]+?)\\s*,\\s*([A-Za-z_$][\\w$]*)${optionalReflectGetReceiverArgument}\\s*\\)`,
        "g"
      ),
      (match, target: string, propertyAlias: string) => {
        const readerName = bodyReaderPropertyAliases.get(propertyAlias);
        return readerName === undefined ? match : `${target}.${readerName}`;
      }
    );
  const reflectedDescriptorAliasBodySlice = [...descriptorReaderAliases.entries()].reduce(
    (source, [descriptorAlias, normalizedReader]) =>
      source.replace(new RegExp(`\\b${escapeRegExp(descriptorAlias)}\\s*${descriptorValueAccessPattern}`, "g"), normalizedReader),
    reflectedBodySlice
  );
  const reflectedDescriptorValueAliasBodySlice = [...descriptorValueReaderAliases.entries()].reduce(
    (source, [valueAlias, normalizedReader]) =>
      source.replace(new RegExp(`\\b${escapeRegExp(valueAlias)}\\s*(?=\\.|\\(|,)`, "g"), normalizedReader),
    reflectedDescriptorAliasBodySlice
  );
  const normalizedReflectedBodySlice = reflectedDescriptorValueAliasBodySlice
    .replace(new RegExp(`\\[\\s*["'\`](${requestBodyReaderNames})["'\`]\\s*\\]\\s*:`, "g"), "$1:")
    .replace(new RegExp(`\\[\\s*["'\`](${requestBodyReaderNames})["'\`]\\s*\\]`, "g"), ".$1")
    .replace(new RegExp(`\\bglobalThis\\s*(?:\\?\\.)?\\[\\s*${literalRequestConstructorNamePattern}\\s*\\]`, "g"), "Request")
    .replace(/\bglobalThis\s*\??\.\s*Request\b/g, "Request")
    .replace(/\bRequest\s*\??\.\s*prototype\b/g, "Request.prototype")
    .replace(/\bRequest\s*\[\s*\(?\s*["'`]prototype["'`]\s*(?:\)?\s+as\s+const\s*\)?|\)?)\s*\]/g, "Request.prototype")
    .replace(/\[\s*["'`]clone["'`]\s*\]/g, ".clone")
    .replace(/\[\s*["'`](call|apply|bind)["'`]\s*\]/g, ".$1")
    .replace(/\.\s*clone\s*\?\.\s*\(/g, ".clone(")
    .replace(/\.\s*(call|apply|bind)\s*\?\.\s*\(/g, ".$1(")
    .replace(new RegExp(`\\.\\s*(${requestBodyReaderNames})\\s*\\?\\.\\s*\\(`, "g"), ".$1(")
    .replace(new RegExp(`(\\.\\s*(?:${requestBodyReaderNames}))\\s*!\\s*(?=\\(|\\.|,|;|\\r?\\n)`, "g"), "$1")
    .replace(
      new RegExp(
        `(\\b[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames}))\\s+(?:as|satisfies)\\s+typeof\\s+[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})`,
        "g"
      ),
      "$1"
    )
    .replace(/\b([A-Za-z_$][\w$]*)\s*\?\.\s*\(/g, "$1(")
    .replace(/\?\.\s*/g, ".")
    .replace(
      new RegExp(
        `\\(\\s*([A-Za-z_$][\\w$]*(?:\\s*\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*(?:call|apply|bind))\\s*\\)`,
        "g"
      ),
      "$1"
    )
    .replace(
      new RegExp(
        `\\(\\s*([A-Za-z_$][\\w$]*(?:\\s*\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames}))\\s*\\)`,
        "g"
      ),
      "$1"
    )
    .replace(/(^|[^A-Za-z0-9_$.\]])\(\s*([A-Za-z_$][\w$]*)\s*\.\s*clone\s*\(\s*\)\s*\)/g, "$1$2.clone()")
    .replace(/(^|[^A-Za-z0-9_$.\]])\(\s*([A-Za-z_$][\w$]*)\s*\)/g, "$1$2");
  const normalizedBodySlice = maskNonCodeTokens(normalizedReflectedBodySlice);
  const requestAliases = new Set([requestParameterName]);
  let discoveredRequestAlias = true;
  while (discoveredRequestAlias) {
    discoveredRequestAlias = false;
    const requestSourcePattern = [...requestAliases].map(escapeRegExp).join("|");
    const requestAliasPattern = new RegExp(
      `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*(?:${requestSourcePattern})${variableDeclaratorEnd}`,
      "g"
    );
    for (const match of normalizedBodySlice.matchAll(requestAliasPattern)) {
      if (!requestAliases.has(match[1])) {
        requestAliases.add(match[1]);
        discoveredRequestAlias = true;
      }
    }
    const requestAssignmentAliasPattern = new RegExp(
      `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${requestSourcePattern})\\s*(?=;|\\r?\\n)`,
      "g"
    );
    for (const match of normalizedBodySlice.matchAll(requestAssignmentAliasPattern)) {
      if (!requestAliases.has(match[1])) {
        requestAliases.add(match[1]);
        discoveredRequestAlias = true;
      }
    }
  }
  const requestSourcePattern = [...requestAliases].map(escapeRegExp).join("|");
  const requestBodyReaderPattern = new RegExp(
    `\\b(?:${requestSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`
  );
  if (requestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const directBoundRequestBodyReaderPattern = new RegExp(
    `\\b(?:${requestSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)\\s*\\(`
  );
  if (directBoundRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const directReflectApplyRequestBodyReaderPattern = new RegExp(
    `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*(?:${requestSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*,`
  );
  if (directReflectApplyRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const directReflectApplyBoundRequestBodyReaderPattern = new RegExp(
    `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*(?:${requestSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)\\s*,`
  );
  if (directReflectApplyBoundRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }

  const requestCloneAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*(?:${requestSourcePattern})\\s*\\.\\s*clone\\s*\\(\\s*\\)${variableDeclaratorEnd}`,
    "g"
  );
  requestCloneAliasPattern.lastIndex = 0;
  const requestCloneAssignmentAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${requestSourcePattern})\\s*\\.\\s*clone\\s*\\(\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const cloneAliases = [
    ...normalizedBodySlice.matchAll(requestCloneAliasPattern),
    ...normalizedBodySlice.matchAll(requestCloneAssignmentAliasPattern)
  ].map((match) => match[1]);
  if (
    cloneAliases.some((alias) =>
      new RegExp(
        `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*${escapeRegExp(alias)}\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*,`
      ).test(normalizedBodySlice)
    )
  ) {
    return true;
  }
  if (
    cloneAliases.some((alias) =>
      new RegExp(
        `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*${escapeRegExp(alias)}\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)\\s*,`
      ).test(normalizedBodySlice)
    )
  ) {
    return true;
  }
  if (
    cloneAliases.some((alias) =>
      new RegExp(
        `\\b${escapeRegExp(alias)}\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\(|\\.\\s*bind\\s*\\(${simpleCallArguments}\\)\\s*\\()`
      ).test(
        normalizedBodySlice
      )
    )
  ) {
    return true;
  }

  const readerSourcePattern = [...requestAliases, ...cloneAliases].map(escapeRegExp).join("|");
  const directPrototypeRequestBodyReaderPattern = new RegExp(
    `\\bRequest\\s*\\.\\s*prototype\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*(?:call|apply)\\s*\\(\\s*(?:${readerSourcePattern})\\b`
  );
  if (directPrototypeRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const directReflectApplyPrototypeRequestBodyReaderPattern = new RegExp(
    `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*Request\\s*\\.\\s*prototype\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*,\\s*(?:${readerSourcePattern})\\b`
  );
  if (directReflectApplyPrototypeRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const directBoundPrototypeRequestBodyReaderPattern = new RegExp(
    `\\bRequest\\s*\\.\\s*prototype\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(\\s*(?:${readerSourcePattern})\\b${simpleCallArguments}\\)\\s*\\(`
  );
  if (directBoundPrototypeRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const objectPrototypeRequestBodyReaderPattern = new RegExp(
    `\\b(?:Object|Reflect)\\s*\\.\\s*getPrototypeOf\\s*\\(\\s*(?:${readerSourcePattern})\\s*\\)\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*(?:call|apply)\\s*\\(\\s*(?:${readerSourcePattern})\\b`
  );
  if (objectPrototypeRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const objectPrototypeReflectApplyRequestBodyReaderPattern = new RegExp(
    `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*(?:Object|Reflect)\\s*\\.\\s*getPrototypeOf\\s*\\(\\s*(?:${readerSourcePattern})\\s*\\)\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*,\\s*(?:${readerSourcePattern})\\b`
  );
  if (objectPrototypeReflectApplyRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const objectPrototypeBoundRequestBodyReaderPattern = new RegExp(
    `\\b(?:Object|Reflect)\\s*\\.\\s*getPrototypeOf\\s*\\(\\s*(?:${readerSourcePattern})\\s*\\)\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(\\s*(?:${readerSourcePattern})\\b${simpleCallArguments}\\)\\s*\\(`
  );
  if (objectPrototypeBoundRequestBodyReaderPattern.test(normalizedBodySlice)) {
    return true;
  }
  const prototypeReaderAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?\\s*=\\s*(?:Request\\s*\\.\\s*prototype|(?:Object|Reflect)\\s*\\.\\s*getPrototypeOf\\s*\\(\\s*(?:${readerSourcePattern})\\s*\\))\\s*\\.\\s*(?:${requestBodyReaderNames})${variableDeclaratorEnd}`,
    "g"
  );
  const assignedPrototypeReaderAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:Request\\s*\\.\\s*prototype|(?:Object|Reflect)\\s*\\.\\s*getPrototypeOf\\s*\\(\\s*(?:${readerSourcePattern})\\s*\\))\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const prototypeReaderAliases = [
    ...normalizedBodySlice.matchAll(prototypeReaderAliasPattern),
    ...normalizedBodySlice.matchAll(assignedPrototypeReaderAliasPattern)
  ].map((match) => match[1]);
  if (
    prototypeReaderAliases.some(
      (alias) =>
        new RegExp(
          `\\b${escapeRegExp(alias)}\\s*\\.\\s*(?:call|apply)\\s*\\(\\s*(?:${readerSourcePattern})\\b`
        ).test(normalizedBodySlice) ||
        new RegExp(
          `\\b${escapeRegExp(alias)}\\s*\\.\\s*bind\\s*\\(\\s*(?:${readerSourcePattern})\\b${simpleCallArguments}\\)\\s*\\(`
        ).test(normalizedBodySlice) ||
        new RegExp(
          `\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*${escapeRegExp(alias)}\\s*,\\s*(?:${readerSourcePattern})\\b`
        ).test(normalizedBodySlice)
    )
  ) {
    return true;
  }
  const normalizedBoundReaderMethodPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?\\s*=\\s*(?:${readerSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)${variableDeclaratorEnd}[\\s\\S]*?\\b\\1\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`
  );
  const assignedBoundReaderMethodPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${readerSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)\\s*(?=;|\\r?\\n)[\\s\\S]*?\\b\\1\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`
  );
  if (normalizedBoundReaderMethodPattern.test(normalizedBodySlice) || assignedBoundReaderMethodPattern.test(normalizedBodySlice)) {
    return true;
  }
  const boundReaderAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?\\s*=\\s*(?:${readerSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)${variableDeclaratorEnd}`,
    "g"
  );
  const assignedBoundReaderAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${readerSourcePattern})\\s*(?:\\.\\s*clone\\s*\\(\\s*\\))?\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*\\.\\s*bind\\s*\\(${simpleCallArguments}\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const boundReaderAliases = [
    ...normalizedBodySlice.matchAll(boundReaderAliasPattern),
    ...normalizedBodySlice.matchAll(assignedBoundReaderAliasPattern)
  ].map((match) => match[1]);
  if (
    boundReaderAliases.some((alias) =>
      new RegExp(`\\b${escapeRegExp(alias)}\\s*\\.\\s*(?:call|apply)\\s*\\(`).test(normalizedBodySlice) ||
      new RegExp(`\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*${escapeRegExp(alias)}\\s*,`).test(normalizedBodySlice)
    )
  ) {
    return true;
  }
  const readerMethodAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*(?:${readerSourcePattern})\\s*\\.\\s*(?:${requestBodyReaderNames})${variableDeclaratorEnd}`,
    "g"
  );
  const assignedReaderMethodAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${readerSourcePattern})\\s*\\.\\s*(?:${requestBodyReaderNames})\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const readerMethodAliases = [
    ...normalizedBodySlice.matchAll(readerMethodAliasPattern),
    ...normalizedBodySlice.matchAll(assignedReaderMethodAliasPattern)
  ].map((match) => match[1]);
  if (
    readerMethodAliases.some((alias) =>
      new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`).test(normalizedBodySlice) ||
      new RegExp(`\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*${escapeRegExp(alias)}\\s*,`).test(normalizedBodySlice)
    )
  ) {
    return true;
  }

  const destructuredReaderAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*=\\s*(?:(?:${readerSourcePattern})|(?:${requestSourcePattern})\\s*\\.\\s*clone\\s*\\(\\s*\\))${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredReaderAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*(?:(?:${readerSourcePattern})|(?:${requestSourcePattern})\\s*\\.\\s*clone\\s*\\(\\s*\\))\\s*\\)\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const destructuredAliases = [
    ...normalizedBodySlice.matchAll(destructuredReaderAliasPattern),
    ...normalizedBodySlice.matchAll(assignedDestructuredReaderAliasPattern)
  ].flatMap((match) =>
    match[1].split(",").flatMap((field) => {
      const fieldMatch = new RegExp(`^\\s*(${requestBodyReaderNames})\\s*(?::\\s*([A-Za-z_$][\\w$]*))?\\s*$`).exec(
        field
      );
      if (fieldMatch !== null) {
        return [fieldMatch[2] ?? fieldMatch[1]];
      }

      const computedLiteralFieldMatch = new RegExp(
        `^\\s*\\[\\s*["'\`](${requestBodyReaderNames})["'\`]\\s*\\]\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*$`
      ).exec(field);
      if (computedLiteralFieldMatch !== null) {
        return [computedLiteralFieldMatch[2]];
      }

      const computedAliasFieldMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(field);
      if (computedAliasFieldMatch !== null && bodyReaderPropertyAliases.has(computedAliasFieldMatch[1])) {
        return [computedAliasFieldMatch[2]];
      }

      return [];
    })
  );

  return destructuredAliases.some((alias) =>
    new RegExp(`\\b${escapeRegExp(alias)}\\s*(?:\\(|\\.\\s*(?:call|apply)\\s*\\()`).test(normalizedBodySlice) ||
    new RegExp(`\\bReflect\\s*\\.\\s*apply\\s*\\(\\s*${escapeRegExp(alias)}\\s*,`).test(normalizedBodySlice)
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

    if (char === "`") {
      masked += " ";
      while (index + 1 < source.length) {
        index += 1;
        const templateChar = source[index];

        if (templateChar === "\\") {
          masked += " ";
          if (index + 1 < source.length) {
            index += 1;
            masked += source[index] === "\n" ? "\n" : " ";
          }
          continue;
        }

        if (templateChar === "$" && source[index + 1] === "{") {
          index += 2;
          let expression = "";
          let depth = 1;
          while (index < source.length && depth > 0) {
            const expressionChar = source[index];
            if (expressionChar === "{") {
              depth += 1;
              expression += expressionChar;
              index += 1;
              continue;
            }
            if (expressionChar === "}") {
              depth -= 1;
              if (depth > 0) {
                expression += expressionChar;
              }
              index += 1;
              continue;
            }
            expression += expressionChar;
            index += 1;
          }
          masked += ` {${maskNonCodeTokens(expression)}}`;
          index -= 1;
          continue;
        }

        masked += templateChar === "\n" ? "\n" : " ";
        if (templateChar === "`") {
          break;
        }
      }
      continue;
    }

    if (char === "\"" || char === "'") {
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

  it("tracks synchronous exported mutating route handlers for role-gate and body-order checks", () => {
    const missingRoleGateSource = `
      export function POST(request: Request) {
        return Response.json({ ok: true });
      }
    `;
    const unsafeSource = `
      export function PATCH(request: Request) {
        const payload = request.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export function DELETE(request: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = request.clone().text();
        return Response.json({ payload });
      }
    `;

    expect(exportedMutatingMethods(missingRoleGateSource)).toEqual(["POST"]);
    expect(exportedMutatingMethodHasRoleGate(missingRoleGateSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("tracks exported const mutating route handlers for role-gate and body-order checks", () => {
    const missingRoleGateSource = `
      export const POST = async (request: Request) => {
        return Response.json({ ok: true });
      };
    `;
    const unsafeArrowSource = `
      export const PATCH = async (request: Request) => {
        const payload = await request.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      };
    `;
    const unsafeFunctionExpressionSource = `
      export const PUT = async function(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      };
    `;
    const safeSource = `
      export const DELETE = async (req: Request) => {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.clone().arrayBuffer();
        return Response.json({ size: payload.byteLength });
      };
    `;

    expect(exportedMutatingMethods(missingRoleGateSource)).toEqual(["POST"]);
    expect(exportedMutatingMethodHasRoleGate(missingRoleGateSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeArrowSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeFunctionExpressionSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("tracks typed exported const mutating route handlers for role-gate and body-order checks", () => {
    const missingRoleGateSource = `
      type RouteHandler = (request: Request) => Promise<Response>;
      export const POST: RouteHandler = async (request: Request) => {
        return Response.json({ ok: true });
      };
    `;
    const unsafeArrowSource = `
      type RouteHandler = (request: Request) => Promise<Response>;
      export const PATCH: RouteHandler = async (request: Request) => {
        const payload = await request.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      };
    `;
    const unsafeFunctionExpressionSource = `
      export const PUT: (req: Request) => Promise<Response> = async function(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      };
    `;
    const safeSource = `
      export const DELETE: (req: Request) => Promise<Response> = async (req: Request) => {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.clone().arrayBuffer();
        return Response.json({ size: payload.byteLength });
      };
    `;

    expect(exportedMutatingMethods(missingRoleGateSource)).toEqual(["POST"]);
    expect(exportedMutatingMethodHasRoleGate(missingRoleGateSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeArrowSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeFunctionExpressionSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("tracks parenthesized exported const mutating route handlers for role-gate and body-order checks", () => {
    const missingRoleGateSource = `
      export const POST = (async (request: Request) => {
        return Response.json({ ok: true });
      });
    `;
    const unsafeArrowSource = `
      export const PATCH = (async (request: Request) => {
        const payload = await request.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      });
    `;
    const unsafeFunctionExpressionSource = `
      export const PUT = (async function updateRoute(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      });
    `;
    const safeSource = `
      export const DELETE = (async (req: Request) => {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.clone().arrayBuffer();
        return Response.json({ size: payload.byteLength });
      });
    `;

    expect(exportedMutatingMethods(missingRoleGateSource)).toEqual(["POST"]);
    expect(exportedMutatingMethodHasRoleGate(missingRoleGateSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeArrowSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeFunctionExpressionSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("tracks named-export mutating route handlers for role-gate and body-order checks", () => {
    const missingRoleGateSource = `
      async function createPost(request: Request) {
        return Response.json({ ok: true });
      }
      export { createPost as POST };
    `;
    const unsafeLocalConstSource = `
      const updateContact: (request: Request) => Promise<Response> = async (request: Request) => {
        const payload = await request.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      };
      export { updateContact as PATCH };
    `;
    const unsafeDirectNamedConstSource = `
      const DELETE = async function(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      };
      export { DELETE };
    `;
    const safeSource = `
      async function replaceCampaign(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.clone().arrayBuffer();
        return Response.json({ size: payload.byteLength });
      }
      export { replaceCampaign as PUT };
    `;

    expect(exportedMutatingMethods(missingRoleGateSource)).toEqual(["POST"]);
    expect(exportedMutatingMethodHasRoleGate(missingRoleGateSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeLocalConstSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectNamedConstSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "PUT")).toBe(false);
  });

  it("ignores non-code mutating route export mentions while discovering handlers", () => {
    const commentOnlySource = `
      // export async function POST(request: Request) {
      //   const payload = await request.json();
      // }
      export async function GET() {
        return Response.json({ ok: true });
      }
    `;
    const stringOnlySource = `
      const example = "export const PATCH = async (request: Request) => request.json()";
      export async function GET() {
        return Response.json({ ok: true });
      }
    `;
    const templateOnlySource = `
      const example = \`export { updateContact as PUT }\`;
      async function updateContact(request: Request) {
        const payload = await request.json();
        return Response.json(payload);
      }
      export async function GET() {
        return Response.json({ ok: true });
      }
    `;
    const safeNamedExportSource = `
      async function updateContact(request: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await request.json();
        return Response.json(payload);
      }
      export { updateContact as PATCH };
    `;

    expect(exportedMutatingMethods(commentOnlySource)).toEqual([]);
    expect(exportedMutatingMethods(stringOnlySource)).toEqual([]);
    expect(exportedMutatingMethods(templateOnlySource)).toEqual([]);
    expect(exportedMutatingMethods(safeNamedExportSource)).toEqual(["PATCH"]);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeNamedExportSource, "PATCH")).toBe(false);
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

  it("treats assigned request body-reader aliases as body parsing for role-gate ordering", () => {
    const unsafeRequestAssignmentSource = `
      export async function POST(req: Request) {
        let bodySource: Request;
        bodySource = req;
        const payload = await bodySource.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneAssignmentSource = `
      export async function PATCH(req: Request) {
        let cloned: Request;
        cloned = req.clone();
        const payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeReaderAssignmentSource = `
      export async function POST(req: Request) {
        let readFormData: Request["formData"];
        readFormData = req.formData;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeBoundAssignmentSource = `
      export async function PATCH(req: Request) {
        let readBlob: Request["blob"];
        readBlob = req.blob.bind(req);
        const payload = await readBlob();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        let bodySource: Request;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        bodySource = req;
        const payload = await bodySource.json();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeRequestAssignmentSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneAssignmentSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReaderAssignmentSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundAssignmentSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats comma-declared request aliases as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const bodySource = req, payload = await bodySource.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneAliasSource = `
      export async function POST(req: Request) {
        const cloned = req.clone(), payload = await cloned.text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeSubsequentCloneAliasSource = `
      export async function POST(req: Request) {
        const bodySource = req, cloned = bodySource.clone(), payload = await cloned.blob();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeSubsequentRequestAliasSource = `
      export async function POST(req: Request) {
        const bodySource = req, sameSource = bodySource, payload = await sameSource.arrayBuffer();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeDetachedAliasSource = `
      export async function POST(req: Request) {
        const readJson = req.json, payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeBoundAliasSource = `
      export async function POST(req: Request) {
        const readFormData = req.formData.bind(req), payload = await readFormData();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeDestructuredAliasSource = `
      export async function POST(req: Request) {
        const { text: readText } = req, payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const bodySource = req, cloned = req.clone();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await bodySource.formData();
        const clonedPayload = await cloned.text();
        return Response.json({ ok: Boolean(payload), clonedPayload });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSubsequentCloneAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSubsequentRequestAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDetachedAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDestructuredAliasSource, "POST")).toBe(true);
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

  it("treats Request prototype body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const payload = await Request.prototype.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Request.prototype.text.apply(cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBoundSource = `
      export async function PUT(req: Request) {
        const payload = await Request.prototype.formData.bind(req)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeAliasSource = `
      export async function DELETE(req: Request) {
        const readArrayBuffer = Request.prototype.arrayBuffer;
        const payload = await Reflect.apply(readArrayBuffer, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeBracketPrototypeSource = `
      export async function PUT(req: Request) {
        const payload = await Request["prototype"]["formData"]["call"](req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeGlobalThisPrototypeSource = `
      export async function PATCH(req: Request) {
        const payload = await globalThis.Request["prototype"].text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalGlobalThisPrototypeSource = `
      export async function DELETE(req: Request) {
        const payload = await globalThis?.["Request"]?.prototype?.["arrayBuffer"]?.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeOptionalRequestPrototypeSource = `
      export async function POST(req: Request) {
        const payload = await Request?.prototype?.text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalBracketRequestPrototypeSource = `
      export async function PATCH(req: Request) {
        const payload = await Request?.["prototype"]?.["json"]?.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeDirectRequestAliasSource = `
      export async function DELETE(req: Request) {
        const RequestCtor = Request;
        const payload = await RequestCtor.prototype.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedDirectRequestAliasSource = `
      export async function PUT(req: Request) {
        let RequestCtor;
        RequestCtor = (Request);
        const payload = await RequestCtor["prototype"]["text"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeNestedParenthesizedDirectRequestAliasSource = `
      export async function POST(req: Request) {
        const RequestCtor = ((Request));
        const payload = await RequestCtor.prototype.formData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeTypeAssertedDirectRequestAliasSource = `
      export async function PATCH(req: Request) {
        const RequestCtor = Request as typeof Request;
        const payload = await RequestCtor.prototype.text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeSatisfiesDirectRequestAliasSource = `
      export async function DELETE(req: Request) {
        const RequestCtor = Request satisfies typeof Request;
        const payload = await RequestCtor.prototype.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeAssignedSatisfiesDirectRequestAliasSource = `
      export async function POST(req: Request) {
        let RequestCtor;
        RequestCtor = Request satisfies typeof Request;
        const payload = await RequestCtor.prototype.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeNonNullDirectRequestAliasSource = `
      export async function PATCH(req: Request) {
        const RequestCtor = Request!;
        const payload = await RequestCtor.prototype.text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedNonNullDirectRequestAliasSource = `
      export async function DELETE(req: Request) {
        let RequestCtor;
        RequestCtor = Request!;
        const payload = await RequestCtor.prototype.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeGlobalThisRequestAliasSource = `
      export async function PATCH(req: Request) {
        const RequestCtor = globalThis.Request;
        const payload = await RequestCtor.prototype.text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeParenthesizedGlobalThisRequestAliasSource = `
      export async function PUT(req: Request) {
        const RequestCtor = (globalThis.Request);
        const payload = await RequestCtor.prototype.arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeTypeAssertedGlobalThisRequestAliasSource = `
      export async function PUT(req: Request) {
        const RequestCtor = globalThis.Request as typeof Request;
        const payload = await RequestCtor.prototype.arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeNonNullGlobalThisRequestAliasSource = `
      export async function PUT(req: Request) {
        const RequestCtor = globalThis.Request!;
        const payload = await RequestCtor.prototype.arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeAssignedNonNullGlobalThisRequestAliasSource = `
      export async function PUT(req: Request) {
        let RequestCtor;
        RequestCtor = globalThis.Request!;
        const payload = await RequestCtor.prototype.arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeNestedParenthesizedGlobalThisRequestAliasSource = `
      export async function POST(req: Request) {
        const RequestCtor = ((globalThis.Request));
        const payload = await RequestCtor.prototype.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeNestedParenthesizedBracketGlobalThisRequestAliasSource = `
      export async function DELETE(req: Request) {
        const RequestCtor = ((globalThis["Request"]));
        const payload = await RequestCtor["prototype"].json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedGlobalThisRequestAliasSource = `
      export async function PUT(req: Request) {
        let RequestCtor;
        RequestCtor = globalThis?.["Request"];
        const payload = await RequestCtor["prototype"]["formData"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeComputedGlobalThisRequestAliasSource = `
      export async function POST(req: Request) {
        const requestConstructorName = "Request" as const;
        const RequestCtor = globalThis[requestConstructorName];
        const payload = await RequestCtor.prototype.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeComputedDestructuredGlobalThisRequestAliasSource = `
      export async function DELETE(req: Request) {
        const requestConstructorName = "Request";
        const { [requestConstructorName]: RequestCtor } = globalThis;
        const payload = await RequestCtor["prototype"]["arrayBuffer"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeParenthesizedGlobalThisAliasRequestSource = `
      export async function POST(req: Request) {
        const root = globalThis;
        const RequestCtor = (root).Request;
        const payload = await RequestCtor.prototype.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeNestedParenthesizedGlobalThisAliasRequestSource = `
      export async function PATCH(req: Request) {
        const root = globalThis;
        const RequestCtor = ((root)).Request;
        const payload = await RequestCtor.prototype.text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeParenthesizedGlobalThisComputedRequestSource = `
      export async function PUT(req: Request) {
        const root = globalThis;
        const requestConstructorName = "Request" as const;
        const RequestCtor = (root)?.[requestConstructorName];
        const payload = await RequestCtor["prototype"].text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeParenthesizedGlobalThisDestructuredRequestSource = `
      export async function DELETE(req: Request) {
        const root = globalThis;
        const { Request: RequestCtor } = (root);
        const payload = await RequestCtor.prototype.formData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeConstAssertedGlobalThisRequestAliasSource = `
      export async function DELETE(req: Request) {
        const RequestCtor = globalThis["Request" as const];
        const payload = await RequestCtor["prototype" as const].arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeDirectConstAssertedGlobalThisRequestSource = `
      export async function PATCH(req: Request) {
        const payload = await globalThis?.["Request" as const]?.["prototype" as const]?.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeDirectReflectSource = `
      export async function POST(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect.apply(Request.prototype.blob, cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeDirectPrototypeAliasSource = `
      export async function PUT(req: Request) {
        const requestPrototype = Request.prototype;
        const payload = await requestPrototype.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeParenthesizedDirectPrototypeAliasSource = `
      export async function DELETE(req: Request) {
        const requestPrototype = ((Request)).prototype;
        const payload = await requestPrototype.text.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeWholeParenthesizedDirectPrototypeAliasSource = `
      export async function PATCH(req: Request) {
        const requestPrototype = (Request.prototype);
        const payload = await requestPrototype.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeTypeAssertedDirectPrototypeAliasSource = `
      export async function DELETE(req: Request) {
        const requestPrototype = Request.prototype as typeof Request.prototype;
        const payload = await requestPrototype.formData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeSatisfiesDirectPrototypeAliasSource = `
      export async function PUT(req: Request) {
        const requestPrototype = Request.prototype satisfies typeof Request.prototype;
        const payload = await requestPrototype.arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeAssignedSatisfiesDirectPrototypeAliasSource = `
      export async function POST(req: Request) {
        let requestPrototype;
        requestPrototype = Request.prototype satisfies typeof Request.prototype;
        const payload = await requestPrototype.formData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeNonNullDirectPrototypeAliasSource = `
      export async function PATCH(req: Request) {
        const requestPrototype = Request.prototype!;
        const payload = await requestPrototype.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedNonNullDirectPrototypeAliasSource = `
      export async function DELETE(req: Request) {
        let requestPrototype;
        requestPrototype = Request.prototype!;
        const payload = await requestPrototype.blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeAssignedPrototypeAliasSource = `
      export async function PATCH(req: Request) {
        let requestPrototype;
        requestPrototype = Request["prototype" as const];
        const payload = await requestPrototype["text"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDestructuredPrototypeAliasSource = `
      export async function DELETE(req: Request) {
        const { prototype: requestPrototype } = Request;
        const payload = await Reflect.apply(requestPrototype.blob, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeComputedDestructuredPrototypeAliasSource = `
      export async function POST(req: Request) {
        const prototypeName = "prototype" as const;
        const { [prototypeName]: requestPrototype } = Request;
        const payload = await requestPrototype.arrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readBlob = Request.prototype.blob;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readBlob.call(req);
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketPrototypeSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalThisPrototypeSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalGlobalThisPrototypeSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalRequestPrototypeSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalBracketRequestPrototypeSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectRequestAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedDirectRequestAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedDirectRequestAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTypeAssertedDirectRequestAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSatisfiesDirectRequestAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSatisfiesDirectRequestAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDirectRequestAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedNonNullDirectRequestAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalThisRequestAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedGlobalThisRequestAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTypeAssertedGlobalThisRequestAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullGlobalThisRequestAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedNonNullGlobalThisRequestAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedGlobalThisRequestAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedBracketGlobalThisRequestAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedGlobalThisRequestAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedGlobalThisRequestAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedDestructuredGlobalThisRequestAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedGlobalThisAliasRequestSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedGlobalThisAliasRequestSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedGlobalThisComputedRequestSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedGlobalThisDestructuredRequestSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeConstAssertedGlobalThisRequestAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectConstAssertedGlobalThisRequestSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectReflectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectPrototypeAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedDirectPrototypeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeWholeParenthesizedDirectPrototypeAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTypeAssertedDirectPrototypeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSatisfiesDirectPrototypeAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSatisfiesDirectPrototypeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDirectPrototypeAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedNonNullDirectPrototypeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedPrototypeAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDestructuredPrototypeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedDestructuredPrototypeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats Object.getPrototypeOf request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const payload = await Object.getPrototypeOf(req).json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Object.getPrototypeOf(cloned).text.apply(cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBoundSource = `
      export async function PUT(req: Request) {
        const payload = await Object.getPrototypeOf(req).formData.bind(req)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeReflectSource = `
      export async function DELETE(req: Request) {
        const payload = await Reflect.apply(Object.getPrototypeOf(req).blob, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeAliasSource = `
      export async function POST(req: Request) {
        const readArrayBuffer = Object.getPrototypeOf(req).arrayBuffer;
        const payload = await Reflect.apply(readArrayBuffer, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object.getPrototypeOf(req).json.call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats Reflect.getPrototypeOf request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.getPrototypeOf(req).json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect.getPrototypeOf(cloned).text.apply(cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBoundSource = `
      export async function PUT(req: Request) {
        const payload = await Reflect.getPrototypeOf(req).formData.bind(req)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeReflectApplySource = `
      export async function DELETE(req: Request) {
        const payload = await Reflect.apply(Reflect.getPrototypeOf(req).blob, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeAliasSource = `
      export async function POST(req: Request) {
        const readArrayBuffer = Reflect.getPrototypeOf(req).arrayBuffer;
        const payload = await Reflect.apply(readArrayBuffer, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.getPrototypeOf(req).json.call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectApplySource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats descriptor-derived Request prototype body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object.getOwnPropertyDescriptor(Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeDescriptorAliasSource = `
      export async function PATCH(req: Request) {
        const readText = Object.getOwnPropertyDescriptor(Request.prototype, "text")?.value;
        const payload = await Reflect.apply(readText, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafePropertyAliasDescriptorSource = `
      export async function PUT(req: Request) {
        const readerName = "formData";
        const readFormData = Object.getOwnPropertyDescriptor(Request.prototype, readerName)?.value;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBracketValueDescriptorSource = `
      export async function DELETE(req: Request) {
        const readBlob = Object.getOwnPropertyDescriptor(Request.prototype, "blob")?.["value"];
        const payload = await readBlob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeReflectDescriptorSource = `
      export async function PUT(req: Request) {
        const readArrayBuffer = Reflect.getOwnPropertyDescriptor(Request.prototype, "arrayBuffer")?.value;
        const payload = await readArrayBuffer.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object.getOwnPropertyDescriptor(Request.prototype, "arrayBuffer")?.["value"].call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDescriptorAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketValueDescriptorSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats optional descriptor lookups as body parsing for role-gate ordering", () => {
    const unsafeOptionalObjectDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object?.getOwnPropertyDescriptor(Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeOptionalReflectDescriptorCallSource = `
      export async function PATCH(req: Request) {
        const readText = Reflect.getOwnPropertyDescriptor?.(Request.prototype, "text")?.["value"];
        const payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalPrototypeLookupSource = `
      export async function PUT(req: Request) {
        const readFormData = Object.getOwnPropertyDescriptor(Object?.getPrototypeOf(req), "formData")?.value;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalReflectPrototypeLookupSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const descriptor = Reflect?.getOwnPropertyDescriptor(Reflect.getPrototypeOf?.(req), readerName);
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object?.getOwnPropertyDescriptor(Request.prototype, "arrayBuffer")?.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalObjectDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectDescriptorCallSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalPrototypeLookupSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectPrototypeLookupSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bracket-notation descriptor and prototype lookups as body parsing for role-gate ordering", () => {
    const unsafeObjectDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object["getOwnPropertyDescriptor"](Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeReflectDescriptorSource = `
      export async function PATCH(req: Request) {
        const readText = Reflect[\`getOwnPropertyDescriptor\`](Request.prototype, "text")?.["value"];
        const payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeObjectPrototypeSource = `
      export async function PUT(req: Request) {
        const readFormData = Object.getOwnPropertyDescriptor(Object["getPrototypeOf"](req), "formData")?.value;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalReflectPrototypeSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const descriptor = Reflect?.["getOwnPropertyDescriptor"]?.(Reflect?.["getPrototypeOf"]?.(req), readerName);
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object["getOwnPropertyDescriptor"](Object["getPrototypeOf"](req), "arrayBuffer")?.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeObjectDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeObjectPrototypeSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectPrototypeSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats non-null descriptor-derived Request prototype body readers as body parsing for role-gate ordering", () => {
    const unsafeNonNullDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object.getOwnPropertyDescriptor(Request.prototype, "json")!.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeNonNullDescriptorAliasSource = `
      export async function PATCH(req: Request) {
        const readText = Object.getOwnPropertyDescriptor(Request.prototype, "text")!.value;
        const payload = await Reflect.apply(readText, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeNonNullPropertyAliasDescriptorSource = `
      export async function PUT(req: Request) {
        const readerName = "formData";
        const readFormData = Object.getOwnPropertyDescriptor(Request.prototype, readerName)!.value;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeNonNullBracketValueDescriptorSource = `
      export async function DELETE(req: Request) {
        const readBlob = Object.getOwnPropertyDescriptor(Request.prototype, "blob")!["value"];
        const payload = await Reflect.apply(readBlob, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeReflectNonNullDescriptorSource = `
      export async function PATCH(req: Request) {
        const readJson = Reflect.getOwnPropertyDescriptor(Request.prototype, "json")!["value"];
        const payload = await Reflect.apply(readJson, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object.getOwnPropertyDescriptor(Request.prototype, "arrayBuffer")!["value"].call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDescriptorAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullPropertyAliasDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullBracketValueDescriptorSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectNonNullDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats descriptor-derived Object.getPrototypeOf request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object.getOwnPropertyDescriptor(Object.getPrototypeOf(req), "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneDescriptorSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Object.getOwnPropertyDescriptor(Object.getPrototypeOf(cloned), "text")?.["value"].apply(cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeNonNullDescriptorAliasSource = `
      export async function PUT(req: Request) {
        const readFormData = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(req), "formData")!.value;
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafePropertyAliasDescriptorSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const readBlob = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(req), readerName)!["value"];
        const payload = await readBlob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeReflectDescriptorSource = `
      export async function PATCH(req: Request) {
        const payload = await Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(req), "text")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object.getOwnPropertyDescriptor(Object.getPrototypeOf(req), "arrayBuffer")!.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDescriptorAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasDescriptorSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats descriptor-derived Reflect.getPrototypeOf request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneDescriptorSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(cloned), "text")?.["value"].apply(cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeNonNullDescriptorSource = `
      export async function PUT(req: Request) {
        const readFormData = Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), "formData")!.value;
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafePropertyAliasSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const readBlob = Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), readerName)!["value"];
        const payload = await readBlob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeReflectDescriptorSource = `
      export async function PATCH(req: Request) {
        const payload = await Reflect.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), "text")?.["value"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), "arrayBuffer")!.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats aliased descriptor objects as body parsing for role-gate ordering", () => {
    const unsafeRequestPrototypeAliasSource = `
      export async function POST(req: Request) {
        const descriptor = Object.getOwnPropertyDescriptor(Request.prototype, "json");
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedDescriptorAliasSource = `
      export async function PATCH(req: Request) {
        let descriptor;
        descriptor = Reflect.getOwnPropertyDescriptor(Request.prototype, "text");
        const payload = await descriptor!["value"].apply(req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafePrototypeDescriptorAliasSource = `
      export async function PUT(req: Request) {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(req), "formData");
        const payload = await descriptor!.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeReflectPrototypePropertyAliasSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const descriptor = Reflect.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), readerName);
        const payload = await descriptor?.["value"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeParenthesizedLiteralAliasSource = `
      export async function POST(req: Request) {
        const descriptor = Object.getOwnPropertyDescriptor(Request.prototype, ("json"));
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedConstAssertedAliasSource = `
      export async function PATCH(req: Request) {
        let descriptor;
        descriptor = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(req), ("text") as const);
        const payload = await descriptor?.["value"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const descriptor = Object.getOwnPropertyDescriptor(Request.prototype, "arrayBuffer");
        const payload = await descriptor?.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeRequestPrototypeAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedDescriptorAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePrototypeDescriptorAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectPrototypePropertyAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedLiteralAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedConstAssertedAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats destructured descriptor value body readers as body parsing for role-gate ordering", () => {
    const unsafeRequestPrototypeSource = `
      export async function POST(req: Request) {
        const { value: readJson } = Object.getOwnPropertyDescriptor(Request.prototype, "json")!;
        const payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedSource = `
      export async function PATCH(req: Request) {
        let readText;
        ({ value: readText } = Reflect.getOwnPropertyDescriptor(Request.prototype, "text")!);
        const payload = await readText.apply(req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafePrototypeSource = `
      export async function PUT(req: Request) {
        const { value: readFormData } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(req), "formData")!;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafePropertyAliasSource = `
      export async function DELETE(req: Request) {
        const readerName = "arrayBuffer";
        const { value: readArrayBuffer } = Reflect.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), readerName)!;
        const payload = await Reflect.apply(readArrayBuffer, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeParenthesizedLiteralSource = `
      export async function POST(req: Request) {
        const { value: readJson } = Object.getOwnPropertyDescriptor(Request.prototype, ("json"))!;
        const payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedConstAssertedSource = `
      export async function PATCH(req: Request) {
        let readText;
        ({ value: readText } = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(req), ("text") as const)!);
        const payload = await readText.apply(req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const { value: readJson } = Object.getOwnPropertyDescriptor(Request.prototype, "json")!;
        const payload = await readJson.call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeRequestPrototypeSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePrototypeSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedLiteralSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedConstAssertedSource, "PATCH")).toBe(true);
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

  it("treats parenthesized request body reader function calls as body parsing for role-gate ordering", () => {
    const unsafeDirectReaderSource = `
      export async function POST(req: Request) {
        const payload = await (req.json)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeClonedReaderSource = `
      export async function PATCH(req: Request) {
        const payload = await (req.clone().text)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAliasReaderSource = `
      export async function POST(req: Request) {
        const readFormData = (req.formData);
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeTypeAssertedReaderSource = `
      export async function PATCH(req: Request) {
        const payload = await (req.text as typeof req.text).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeSatisfiesAliasReaderSource = `
      export async function PUT(req: Request) {
        const readFormData = req.formData satisfies typeof req.formData;
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeCloneTypeAssertedAliasSource = `
      export async function DELETE(req: Request) {
        const cloned = req.clone();
        const readBlob = cloned.blob as typeof cloned.blob;
        const payload = await readBlob.call(cloned);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeNonNullDirectReaderSource = `
      export async function POST(req: Request) {
        const payload = await req.json!();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeNonNullReaderCallSource = `
      export async function PATCH(req: Request) {
        const payload = await req.clone().text!.call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeNonNullAliasReaderSource = `
      export async function PUT(req: Request) {
        const readFormData = req.formData!;
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await (req.json)();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectReaderSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeClonedReaderSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasReaderSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTypeAssertedReaderSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSatisfiesAliasReaderSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneTypeAssertedAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullDirectReaderSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullReaderCallSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNonNullAliasReaderSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
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
    const unsafeTemplateLiteralDirectSource = `
      export async function POST(req: Request) {
        const payload = await req[\`json\`]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeTemplateLiteralCloneSource = `
      export async function PATCH(req: Request) {
        const payload = await req[\`clone\`]()[\`text\`]();
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
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateLiteralDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateLiteralCloneSource, "PATCH")).toBe(true);
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
    const unsafeOptionalCallSource = `
      export async function POST(req: Request) {
        const { arrayBuffer: readArrayBuffer } = req;
        const payload = await readArrayBuffer?.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload?.byteLength });
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
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalCallSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats computed destructured request body readers as body parsing for role-gate ordering", () => {
    const unsafeLiteralSource = `
      export async function POST(req: Request) {
        const { ["json"]: readJson } = req;
        const payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafePropertyAliasSource = `
      export async function PATCH(req: Request) {
        const readerName = "text";
        const { [readerName]: readText } = req.clone();
        const payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedSource = `
      export async function PUT(req: Request) {
        let readFormData;
        const readerName = ("formData");
        ({ [readerName]: readFormData } = req);
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readerName = "arrayBuffer";
        const { [readerName]: readArrayBuffer } = req;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readArrayBuffer.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeLiteralSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSource, "PUT")).toBe(true);
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

  it("treats assigned destructured request body readers as body parsing for role-gate ordering", () => {
    const unsafeAssignedSource = `
      export async function POST(req: Request) {
        let readJson;
        ({ json: readJson } = req);
        const payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedCloneSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        let readText;
        ({ text: readText } = cloned);
        const payload = await Reflect.apply(readText, cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDirectCloneAssignmentSource = `
      export async function PUT(req: Request) {
        let readArrayBuffer;
        ({ arrayBuffer: readArrayBuffer } = req.clone());
        const payload = await readArrayBuffer.apply(req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        let readJson;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        ({ json: readJson } = req);
        const payload = await readJson.call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectCloneAssignmentSource, "PUT")).toBe(true);
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

  it("treats bracket-notation bound request body reader aliases as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const readJson = req["json"].bind(req);
        const payload = await readJson();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneAliasSource = `
      export async function POST(req: Request) {
        const cloned = req["clone"]();
        const readText = cloned["text"].bind(cloned);
        const payload = await readText();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readFormData = req["formData"].bind(req);
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

  it("treats direct bound request body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeDirectBoundSource = `
      export async function POST(req: Request) {
        const payload = await req.json.bind(req)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneBoundSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.text.bind(cloned)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDirectCloneBoundSource = `
      export async function PUT(req: Request) {
        const payload = await req.clone().blob.bind(req)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.formData.bind(req)();
        return Response.json({ ok: Boolean(payload) });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectBoundSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneBoundSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectCloneBoundSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats direct call and apply request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectCallSource = `
      export async function POST(req: Request) {
        const payload = await req.json.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneApplySource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await cloned.text.apply(cloned);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBracketCallSource = `
      export async function POST(req: Request) {
        const payload = await req["formData"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeParenthesizedCallSource = `
      export async function DELETE(req: Request) {
        const payload = await (req.json.call)(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeParenthesizedCloneApplySource = `
      export async function PUT(req: Request) {
        const payload = await (req.clone().text.apply)(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.json.call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectCallSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneApplySource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketCallSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedCallSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedCloneApplySource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats optional call/apply body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeDirectOptionalCallSource = `
      export async function POST(req: Request) {
        const payload = await req.json.call?.(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeDetachedOptionalCallSource = `
      export async function POST(req: Request) {
        const readText = req.text;
        const payload = await readText?.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBoundOptionalInvocationSource = `
      export async function PATCH(req: Request) {
        const readFormData = req.formData.bind?.(req);
        const payload = await readFormData?.();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readJson = req.json;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readJson?.call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectOptionalCallSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDetachedOptionalCallSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundOptionalInvocationSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bracket-notation call/apply/bind body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeBracketCallMethodSource = `
      export async function POST(req: Request) {
        const payload = await req.json["call"](req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeTemplateApplyMethodSource = `
      export async function PATCH(req: Request) {
        const payload = await req.clone().text[\`apply\`](req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBracketBindMethodSource = `
      export async function PUT(req: Request) {
        const payload = await req.formData["bind"](req)();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeBoundAliasBracketCallSource = `
      export async function DELETE(req: Request) {
        const readBlob = req.blob.bind(req);
        const payload = await readBlob["call"](undefined);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readJson = req.json.bind(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readJson["apply"](undefined);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketCallMethodSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateApplyMethodSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketBindMethodSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundAliasBracketCallSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats Reflect.apply request body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.apply(req.json, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect.apply(cloned.text, cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeInlineCloneSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.apply(req.clone().blob, req.clone(), []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeDetachedSource = `
      export async function PUT(req: Request) {
        const readFormData = req.formData;
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDestructuredSource = `
      export async function DELETE(req: Request) {
        const { arrayBuffer: readArrayBuffer } = req;
        const payload = await Reflect.apply(readArrayBuffer, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.apply(req.json, req, []);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeInlineCloneSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDetachedSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDestructuredSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats optional Reflect.apply request body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeOptionalReflectObjectSource = `
      export async function POST(req: Request) {
        const payload = await Reflect?.apply(req.json, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeOptionalReflectApplySource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect.apply?.(cloned.text, cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalReflectBoundAliasSource = `
      export async function PUT(req: Request) {
        const readFormData = req.formData.bind(req);
        const payload = await Reflect?.apply(readFormData, undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.apply?.(req.json, req, []);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectObjectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectApplySource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectBoundAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bracket-notation Reflect.apply request body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeBracketApplySource = `
      export async function POST(req: Request) {
        const payload = await Reflect["apply"](req.json, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeTemplateBracketApplySource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect[\`apply\`](cloned.text, cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalBracketApplySource = `
      export async function PUT(req: Request) {
        const readFormData = req.formData.bind(req);
        const payload = await Reflect?.["apply"]?.(readFormData, undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect["apply"](req.json, req, []);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketApplySource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateBracketApplySource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalBracketApplySource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats aliased Reflect.apply request body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const reflectApply = Reflect.apply;
        const payload = await reflectApply(req.json, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedBracketAliasSource = `
      export async function PATCH(req: Request) {
        let reflectApply;
        reflectApply = Reflect["apply"];
        const cloned = req.clone();
        const payload = await reflectApply(cloned.text, cloned, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDestructuredAliasSource = `
      export async function PUT(req: Request) {
        const { apply: reflectApply } = Reflect;
        const readFormData = req.formData.bind(req);
        const payload = await reflectApply(readFormData, undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeComputedDestructuredAliasSource = `
      export async function DELETE(req: Request) {
        const methodName = "apply" as const;
        const { [methodName]: reflectApply } = Reflect;
        const payload = await reflectApply(req.clone().blob, req.clone(), []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const { apply: reflectApply } = Reflect;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await reflectApply(req.json, req, []);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedBracketAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDestructuredAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedDestructuredAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats Reflect.apply bound request body reader invocations as body parsing for role-gate ordering", () => {
    const unsafeDirectBoundSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.apply(req.json.bind(req), undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneBoundSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect.apply(cloned.text.bind(cloned), undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeBoundAliasSource = `
      export async function PUT(req: Request) {
        const readFormData = req.formData.bind(req);
        const payload = await Reflect.apply(readFormData, undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedBoundAliasSource = `
      export async function DELETE(req: Request) {
        let readBlob;
        readBlob = req.blob.bind(req);
        const payload = await Reflect.apply(readBlob, undefined, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readJson = req.json.bind(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.apply(readJson, undefined, []);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectBoundSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneBoundSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBoundAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedBoundAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bound request body reader call/apply aliases as body parsing for role-gate ordering", () => {
    const unsafeCallAliasSource = `
      export async function POST(req: Request) {
        const readJson = req.json.bind(req);
        const payload = await readJson.call(undefined);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeApplyAliasSource = `
      export async function PATCH(req: Request) {
        const readText = req.clone().text.bind(req.clone());
        const payload = await readText.apply(undefined);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedCallAliasSource = `
      export async function PUT(req: Request) {
        let readFormData;
        readFormData = req.formData.bind(req);
        const payload = await readFormData.call(null);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readJson = req.json.bind(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await readJson.apply(undefined);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCallAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeApplyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedCallAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats Reflect.get request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.get(req, \`json\`).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneSource = `
      export async function PATCH(req: Request) {
        const cloned = req.clone();
        const payload = await Reflect.get(cloned, "text").call(cloned);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeInlineCloneSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.get(req.clone(), \`blob\`).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeAliasSource = `
      export async function PUT(req: Request) {
        const readFormData = Reflect.get(req, "formData");
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedAliasSource = `
      export async function DELETE(req: Request) {
        let readBlob;
        readBlob = Reflect.get(req, \`blob\`);
        const payload = await readBlob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafePropertyAliasSource = `
      export async function PATCH(req: Request) {
        const readerName = "json";
        const payload = await Reflect.get(req, readerName).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedPropertyAliasSource = `
      export async function PUT(req: Request) {
        let readerName;
        readerName = "text";
        const payload = await Reflect.get(req.clone(), readerName).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeReceiverSource = `
      export async function DELETE(req: Request) {
        const payload = await Reflect.get(req, "json", req).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCloneReceiverSource = `
      export async function PATCH(req: Request) {
        const readerName = "text";
        const payload = await Reflect.get(req.clone(), readerName, req.clone()).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalReflectObjectSource = `
      export async function POST(req: Request) {
        const payload = await Reflect?.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeOptionalReflectGetSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const payload = await Reflect.get?.(req.clone(), readerName, req.clone()).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.get(req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeInlineCloneSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedPropertyAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReceiverSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneReceiverSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectObjectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectGetSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bracket-notation Reflect.get request body readers as body parsing for role-gate ordering", () => {
    const unsafeBracketGetSource = `
      export async function POST(req: Request) {
        const payload = await Reflect["get"](req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeTemplateBracketGetSource = `
      export async function PATCH(req: Request) {
        const readerName = "text";
        const payload = await Reflect[\`get\`](req.clone(), readerName, req.clone()).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalBracketGetSource = `
      export async function PUT(req: Request) {
        const payload = await Reflect?.["get"]?.(req, "formData").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect["get"](req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBracketGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateBracketGetSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalBracketGetSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats globalThis Object and Reflect body-reader lookups as body parsing for role-gate ordering", () => {
    const unsafeGlobalReflectGetSource = `
      export async function POST(req: Request) {
        const payload = await globalThis.Reflect.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeGlobalBracketReflectApplySource = `
      export async function PATCH(req: Request) {
        const payload = await globalThis["Reflect"].apply(req.clone().text, req.clone(), []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeGlobalObjectDescriptorSource = `
      export async function PUT(req: Request) {
        const payload = await globalThis.Object.getOwnPropertyDescriptor(
          globalThis.Reflect.getPrototypeOf(req),
          "formData"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeOptionalGlobalObjectPrototypeSource = `
      export async function DELETE(req: Request) {
        const payload = await globalThis?.Object.getPrototypeOf(req).blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeOptionalGlobalBracketReflectGetSource = `
      export async function POST(req: Request) {
        const payload = await globalThis?.["Reflect"]?.get(req, "text").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalGlobalBracketObjectDescriptorSource = `
      export async function PATCH(req: Request) {
        const payload = await globalThis?.["Object"]?.getOwnPropertyDescriptor(
          globalThis?.["Reflect"]?.getPrototypeOf(req),
          "json"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeParenthesizedGlobalReflectGetSource = `
      export async function PUT(req: Request) {
        const payload = await (globalThis).Reflect.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeParenthesizedGlobalObjectDescriptorSource = `
      export async function DELETE(req: Request) {
        const payload = await (globalThis)["Object"].getOwnPropertyDescriptor(
          (globalThis).Reflect.getPrototypeOf(req),
          "text"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeNestedParenthesizedGlobalReflectGetSource = `
      export async function POST(req: Request) {
        const payload = await ((globalThis)).Reflect.get(req, "blob").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeNestedParenthesizedOptionalGlobalDescriptorSource = `
      export async function PATCH(req: Request) {
        const payload = await ((globalThis))?.["Object"]?.getOwnPropertyDescriptor(
          ((globalThis))?.Reflect.getPrototypeOf(req),
          "arrayBuffer"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeGlobalBracketedMethodDescriptorSource = `
      export async function PUT(req: Request) {
        const payload = await globalThis.Object["getOwnPropertyDescriptor"](
          globalThis.Reflect["getPrototypeOf"](req),
          "json"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeGlobalBracketedReflectGetSource = `
      export async function DELETE(req: Request) {
        const payload = await globalThis["Reflect"]["get"](req.clone(), "text").call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeGlobalComputedReflectGetSource = `
      export async function POST(req: Request) {
        const builtInName = "Reflect" as const;
        const payload = await globalThis[builtInName]["get"](req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeGlobalComputedObjectDescriptorSource = `
      export async function PATCH(req: Request) {
        const objectName = ("Object");
        const reflectName = "Reflect" as const;
        const payload = await globalThis[objectName]["getOwnPropertyDescriptor"](
          globalThis[reflectName]["getPrototypeOf"](req),
          "formData"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeGlobalAliasReflectGetSource = `
      export async function PUT(req: Request) {
        const root = globalThis;
        const payload = await root.Reflect.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedGlobalAliasDescriptorSource = `
      export async function DELETE(req: Request) {
        let root;
        root = (globalThis);
        const payload = await root?.["Object"]?.getOwnPropertyDescriptor(
          root?.["Reflect"]?.getPrototypeOf(req),
          "text"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeTypeAssertedGlobalAliasReflectGetSource = `
      export async function POST(req: Request) {
        const root = globalThis as typeof globalThis;
        const payload = await root.Reflect.get(req, "arrayBuffer").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeAssignedTypeAssertedGlobalAliasDescriptorSource = `
      export async function PATCH(req: Request) {
        let root;
        root = globalThis as typeof globalThis;
        const payload = await root.Object.getOwnPropertyDescriptor(
          root.Reflect.getPrototypeOf(req),
          "blob"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeParenthesizedTypeAssertedGlobalAliasReflectGetSource = `
      export async function POST(req: Request) {
        const root = (globalThis as typeof globalThis);
        const payload = await root.Reflect.get(req, "text").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedParenthesizedTypeAssertedGlobalAliasDescriptorSource = `
      export async function PATCH(req: Request) {
        let root;
        root = ((globalThis as typeof globalThis));
        const payload = await root.Object.getOwnPropertyDescriptor(
          root.Reflect.getPrototypeOf(req),
          "formData"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeSatisfiesGlobalAliasReflectGetSource = `
      export async function PUT(req: Request) {
        const root = globalThis satisfies typeof globalThis;
        const payload = await root.Reflect.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedSatisfiesGlobalAliasDescriptorSource = `
      export async function DELETE(req: Request) {
        let root;
        root = globalThis satisfies typeof globalThis;
        const payload = await root.Object.getOwnPropertyDescriptor(
          root.Reflect.getPrototypeOf(req),
          "text"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeGlobalAliasComputedReflectGetSource = `
      export async function POST(req: Request) {
        const root = globalThis;
        const builtInName = "Reflect" as const;
        const payload = await root[builtInName]["get"](req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeGlobalAliasComputedObjectDescriptorSource = `
      export async function PATCH(req: Request) {
        const root = globalThis;
        const objectName = ("Object");
        const reflectName = "Reflect" as const;
        const payload = await root[objectName]["getOwnPropertyDescriptor"](
          root[reflectName]["getPrototypeOf"](req),
          "formData"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeDestructuredGlobalReflectSource = `
      export async function POST(req: Request) {
        const { Reflect: ReflectBuiltin } = globalThis;
        const payload = await ReflectBuiltin.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeComputedDestructuredGlobalObjectSource = `
      export async function PATCH(req: Request) {
        const root = globalThis;
        const objectName = "Object" as const;
        const reflectName = ("Reflect");
        const { [objectName]: ObjectBuiltin } = root;
        const { [reflectName]: ReflectBuiltin } = root;
        const payload = await ObjectBuiltin.getOwnPropertyDescriptor(
          ReflectBuiltin.getPrototypeOf(req),
          "formData"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeAssignedDestructuredGlobalObjectSource = `
      export async function PUT(req: Request) {
        let ObjectBuiltin;
        const root = globalThis;
        ({ ["Object"]: ObjectBuiltin } = root);
        const payload = await ObjectBuiltin.getOwnPropertyDescriptor(Request.prototype, "blob")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await globalThis.Reflect.get(req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalBracketReflectApplySource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalObjectDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalGlobalObjectPrototypeSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalGlobalBracketReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalGlobalBracketObjectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedGlobalReflectGetSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedGlobalObjectDescriptorSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedGlobalReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedOptionalGlobalDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalBracketedMethodDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalBracketedReflectGetSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalComputedReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalComputedObjectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalAliasReflectGetSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedGlobalAliasDescriptorSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTypeAssertedGlobalAliasReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedTypeAssertedGlobalAliasDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedTypeAssertedGlobalAliasReflectGetSource, "POST")).toBe(
      true
    );
    expect(
      mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedParenthesizedTypeAssertedGlobalAliasDescriptorSource, "PATCH")
    ).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSatisfiesGlobalAliasReflectGetSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSatisfiesGlobalAliasDescriptorSource, "DELETE")).toBe(
      true
    );
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalAliasComputedReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeGlobalAliasComputedObjectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDestructuredGlobalReflectSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedDestructuredGlobalObjectSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedDestructuredGlobalObjectSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats parenthesized Object and Reflect body-reader lookups as body parsing for role-gate ordering", () => {
    const unsafeParenthesizedReflectGetSource = `
      export async function POST(req: Request) {
        const payload = await (Reflect).get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeNestedParenthesizedObjectDescriptorSource = `
      export async function PATCH(req: Request) {
        const payload = await ((Object)).getOwnPropertyDescriptor(
          (Reflect).getPrototypeOf(req),
          "text"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeParenthesizedBracketReflectApplySource = `
      export async function PUT(req: Request) {
        const payload = await ((Reflect))?.["apply"]?.(req.clone().blob, req.clone(), []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await (Reflect).get(req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedObjectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedBracketReflectApplySource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats aliased Object and Reflect built-ins as body parsing for role-gate ordering", () => {
    const unsafeReflectAliasSource = `
      export async function POST(req: Request) {
        const ReflectBuiltin = Reflect;
        const payload = await ReflectBuiltin.get(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeObjectAliasSource = `
      export async function PATCH(req: Request) {
        const ObjectBuiltin = Object;
        const payload = await ObjectBuiltin.getOwnPropertyDescriptor(
          Reflect.getPrototypeOf(req),
          "text"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeAssignedReflectAliasSource = `
      export async function PUT(req: Request) {
        let ReflectBuiltin;
        ReflectBuiltin = Reflect;
        const payload = await ReflectBuiltin.apply(req.clone().blob, req.clone(), []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeTypeAssertedObjectAliasSource = `
      export async function DELETE(req: Request) {
        const ObjectBuiltin = Object as typeof Object;
        const payload = await ObjectBuiltin.getPrototypeOf(req).formData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeParenthesizedTypeAssertedReflectAliasSource = `
      export async function POST(req: Request) {
        const ReflectBuiltin = (Reflect as typeof Reflect);
        const payload = await ReflectBuiltin.get(req, "arrayBuffer").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeNestedParenthesizedTypeAssertedObjectAliasSource = `
      export async function PATCH(req: Request) {
        let ObjectBuiltin;
        ObjectBuiltin = ((Object as typeof Object));
        const payload = await ObjectBuiltin.getOwnPropertyDescriptor(
          Request.prototype,
          "blob"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeSatisfiesReflectAliasSource = `
      export async function PUT(req: Request) {
        const ReflectBuiltin = Reflect satisfies typeof Reflect;
        const payload = await ReflectBuiltin.get(req, "formData").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeAssignedSatisfiesObjectAliasSource = `
      export async function DELETE(req: Request) {
        let ObjectBuiltin;
        ObjectBuiltin = Object satisfies typeof Object;
        const payload = await ObjectBuiltin.getOwnPropertyDescriptor(
          Reflect.getPrototypeOf(req),
          "arrayBuffer"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const ReflectBuiltin = Reflect;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await ReflectBuiltin.get(req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeObjectAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedReflectAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTypeAssertedObjectAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedTypeAssertedReflectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedParenthesizedTypeAssertedObjectAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeSatisfiesReflectAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedSatisfiesObjectAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats aliased Reflect.get request body readers as body parsing for role-gate ordering", () => {
    const unsafeDirectAliasSource = `
      export async function POST(req: Request) {
        const reflectGet = Reflect.get;
        const payload = await reflectGet(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedBracketAliasSource = `
      export async function PATCH(req: Request) {
        let reflectGet;
        reflectGet = Reflect["get"];
        const readerName = "text";
        const payload = await reflectGet(req.clone(), readerName, req.clone()).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDestructuredAliasSource = `
      export async function PUT(req: Request) {
        const { get: reflectGet } = Reflect;
        const readFormData = reflectGet(req, "formData");
        const payload = await Reflect.apply(readFormData, req, []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeComputedDestructuredAliasSource = `
      export async function DELETE(req: Request) {
        const methodName = "get" as const;
        const readerName = "blob";
        const { [methodName]: reflectGet } = Reflect;
        const payload = await reflectGet(req, readerName).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const { get: reflectGet } = Reflect;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await reflectGet(req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDirectAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedBracketAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDestructuredAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedDestructuredAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats computed Object and Reflect method aliases as body parsing for role-gate ordering", () => {
    const unsafeComputedReflectGetAliasSource = `
      export async function POST(req: Request) {
        const methodName = "get";
        const reflectGet = Reflect[methodName];
        const payload = await reflectGet(req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedComputedReflectApplyAliasSource = `
      export async function PATCH(req: Request) {
        const methodName = "apply" as const;
        let reflectApply;
        reflectApply = Reflect[methodName];
        const payload = await reflectApply(req.clone().text, req.clone(), []);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeComputedObjectDescriptorAliasSource = `
      export async function PUT(req: Request) {
        const lookupName = "getOwnPropertyDescriptor";
        const getDescriptor = Object[lookupName];
        const payload = await getDescriptor(Request.prototype, "formData")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeComputedReflectPrototypeAliasSource = `
      export async function DELETE(req: Request) {
        const lookupName = "getPrototypeOf" as const;
        const getPrototype = Reflect[lookupName];
        const payload = await Object.getOwnPropertyDescriptor(getPrototype(req), "blob")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const methodName = "get";
        const reflectGet = Reflect[methodName];
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await reflectGet(req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedReflectGetAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedComputedReflectApplyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedObjectDescriptorAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedReflectPrototypeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats call and apply invocations of reflective helper aliases as body parsing for role-gate ordering", () => {
    const unsafeReflectGetCallAliasSource = `
      export async function POST(req: Request) {
        const reflectGet = Reflect.get;
        const payload = await reflectGet.call(Reflect, req, "json").call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeReflectApplyApplyAliasSource = `
      export async function PATCH(req: Request) {
        const reflectApply = Reflect.apply;
        const payload = await reflectApply.apply(Reflect, [req.clone().text, req.clone(), []]);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDescriptorCallAliasSource = `
      export async function PUT(req: Request) {
        const getDescriptor = Object.getOwnPropertyDescriptor;
        const payload = await getDescriptor.call(Object, Request.prototype, "formData")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafePrototypeApplyAliasSource = `
      export async function DELETE(req: Request) {
        const payload = await Reflect.getPrototypeOf.apply(Reflect, [req]).blob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const reflectGet = Reflect.get;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await reflectGet.call(Reflect, req, "arrayBuffer").call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectGetCallAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectApplyApplyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDescriptorCallAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePrototypeApplyAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats parenthesized body-reader property aliases as body parsing for role-gate ordering", () => {
    const unsafeReflectGetSource = `
      export async function POST(req: Request) {
        const readerName = ("json");
        const payload = await Reflect.get(req, readerName).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedDescriptorSource = `
      export async function PATCH(req: Request) {
        let readerName;
        readerName = ("text");
        const descriptor = Object.getOwnPropertyDescriptor(Request.prototype, readerName);
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeConstAssertedReflectGetSource = `
      export async function DELETE(req: Request) {
        const readerName = "formData" as const;
        const payload = await Reflect.get(req, readerName).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ ok: Boolean(payload) });
      }
    `;
    const unsafeParenthesizedConstAssertedDescriptorSource = `
      export async function PUT(req: Request) {
        const readerName = ("blob") as const;
        const descriptor = Object.getOwnPropertyDescriptor(Request.prototype, readerName);
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const unsafeInParensConstAssertedReflectGetSource = `
      export async function PATCH(req: Request) {
        const readerName = ("text" as const);
        const payload = await Reflect.get(req.clone(), readerName).call(req.clone());
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const readerName = ("arrayBuffer");
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.get(req, readerName).call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeConstAssertedReflectGetSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeParenthesizedConstAssertedDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeInParensConstAssertedReflectGetSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats parenthesized inline body-reader property names as body parsing for role-gate ordering", () => {
    const unsafeReflectGetSource = `
      export async function POST(req: Request) {
        const payload = await Reflect.get(req, ("json")).call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeDescriptorSource = `
      export async function PATCH(req: Request) {
        const payload = await Object.getOwnPropertyDescriptor(Request.prototype, ("text"))?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafePrototypeDescriptorSource = `
      export async function PUT(req: Request) {
        const payload = await Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(req), ("formData"))?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function DELETE(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect.get(req, ("blob")).call(req);
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectGetSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePrototypeDescriptorSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("treats optional bracket reflective helper calls as body parsing for role-gate ordering", () => {
    const unsafeOptionalObjectDescriptorSource = `
      export async function POST(req: Request) {
        const payload = await Object?.["getOwnPropertyDescriptor"]?.(Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeOptionalReflectDescriptorSource = `
      export async function PATCH(req: Request) {
        const descriptor = Reflect?.["getOwnPropertyDescriptor"]?.(Request.prototype, "text");
        const payload = await descriptor?.["value"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeOptionalObjectPrototypeSource = `
      export async function PUT(req: Request) {
        const payload = await Object?.["getOwnPropertyDescriptor"]?.(
          Object?.["getPrototypeOf"]?.(req),
          "formData"
        )?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function DELETE(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await Reflect?.["getOwnPropertyDescriptor"]?.(Request.prototype, "blob")?.value.call(req);
        return Response.json({ size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalObjectDescriptorSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalReflectDescriptorSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalObjectPrototypeSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("treats aliased descriptor and prototype lookup calls as body parsing for role-gate ordering", () => {
    const unsafeDescriptorAliasSource = `
      export async function POST(req: Request) {
        const getDescriptor = Object.getOwnPropertyDescriptor;
        const payload = await getDescriptor(Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedReflectDescriptorAliasSource = `
      export async function PATCH(req: Request) {
        let getDescriptor;
        getDescriptor = Reflect.getOwnPropertyDescriptor;
        const descriptor = getDescriptor(Request.prototype, "text");
        const payload = await descriptor?.["value"].call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafePrototypeAliasSource = `
      export async function PUT(req: Request) {
        const getPrototype = Object.getPrototypeOf;
        const payload = await Object.getOwnPropertyDescriptor(getPrototype(req), "formData")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeDescriptorAndPrototypeAliasSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const getDescriptor = Reflect.getOwnPropertyDescriptor;
        const getPrototype = Reflect.getPrototypeOf;
        const { value: readBlob } = getDescriptor(getPrototype(req), readerName)!;
        const payload = await readBlob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const getDescriptor = Object.getOwnPropertyDescriptor;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await getDescriptor(Request.prototype, "arrayBuffer")?.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDescriptorAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedReflectDescriptorAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePrototypeAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDescriptorAndPrototypeAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats destructured descriptor and prototype lookup aliases as body parsing for role-gate ordering", () => {
    const unsafeObjectDescriptorAliasSource = `
      export async function POST(req: Request) {
        const { getOwnPropertyDescriptor: getDescriptor } = Object;
        const payload = await getDescriptor(Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeReflectDescriptorAliasSource = `
      export async function PATCH(req: Request) {
        let getDescriptor;
        ({ getOwnPropertyDescriptor: getDescriptor } = Reflect);
        const descriptor = getDescriptor(Request.prototype, "text");
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeObjectPrototypeAliasSource = `
      export async function PUT(req: Request) {
        const { getPrototypeOf: getPrototype } = Object;
        const payload = await Object.getOwnPropertyDescriptor(getPrototype(req), "formData")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeCombinedReflectAliasSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const { getOwnPropertyDescriptor: getDescriptor, getPrototypeOf: getPrototype } = Reflect;
        const { value: readBlob } = getDescriptor(getPrototype(req), readerName)!;
        const payload = await readBlob.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.size });
      }
    `;
    const safeSource = `
      export async function POST(req: Request) {
        const { getOwnPropertyDescriptor: getDescriptor } = Object;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await getDescriptor(Request.prototype, "arrayBuffer")?.value.call(req);
        return Response.json({ size: payload.byteLength });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeObjectDescriptorAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectDescriptorAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeObjectPrototypeAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCombinedReflectAliasSource, "DELETE")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "POST")).toBe(false);
  });

  it("treats bracket destructured descriptor-value aliases as body parsing for role-gate ordering", () => {
    const unsafePrototypeValueAliasSource = `
      export async function POST(req: Request) {
        const { ["value"]: readJson } = Object.getOwnPropertyDescriptor(Request.prototype, "json")!;
        const payload = await readJson.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeReflectPrototypeValueAliasSource = `
      export async function PATCH(req: Request) {
        let readText;
        ({ ["value"]: readText } = Reflect.getOwnPropertyDescriptor(Request.prototype, "text")!);
        const payload = await readText.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeDescriptorPropertyAliasSource = `
      export async function PUT(req: Request) {
        const readerName = "formData" as const;
        const { ["value"]: readFormData } = Object.getOwnPropertyDescriptor(Reflect.getPrototypeOf(req), readerName)!;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function DELETE(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const { ["value"]: readBlob } = Object.getOwnPropertyDescriptor(Request.prototype, "blob")!;
        const payload = await readBlob.call(req);
        return Response.json({ size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePrototypeValueAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeReflectPrototypeValueAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeDescriptorPropertyAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
  });

  it("treats computed destructured descriptor and prototype lookup aliases as body parsing for role-gate ordering", () => {
    const unsafeComputedDescriptorAliasSource = `
      export async function POST(req: Request) {
        const { ["getOwnPropertyDescriptor"]: getDescriptor } = Object;
        const payload = await getDescriptor(Request.prototype, "json")?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeComputedReflectDescriptorAliasSource = `
      export async function PATCH(req: Request) {
        let getDescriptor;
        ({ ["getOwnPropertyDescriptor"]: getDescriptor } = Reflect);
        const descriptor = getDescriptor(Request.prototype, "text");
        const payload = await descriptor?.value.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafePropertyAliasSource = `
      export async function PUT(req: Request) {
        const descriptorLookupName = "getOwnPropertyDescriptor" as const;
        const prototypeLookupName = ("getPrototypeOf");
        const { [descriptorLookupName]: getDescriptor } = Object;
        const { [prototypeLookupName]: getPrototype } = Reflect;
        const { value: readFormData } = getDescriptor(getPrototype(req), "formData")!;
        const payload = await readFormData.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safeSource = `
      export async function DELETE(req: Request) {
        const descriptorLookupName = "getOwnPropertyDescriptor";
        const { [descriptorLookupName]: getDescriptor } = Object;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await getDescriptor(Request.prototype, "blob")?.value.call(req);
        return Response.json({ size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedDescriptorAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeComputedReflectDescriptorAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeSource, "DELETE")).toBe(false);
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

  it("treats template interpolation body readers as body parsing before role-gate ordering checks", () => {
    const unsafeBodyReaderSource = `
      export async function POST(req: Request) {
        const sample = \`payload: ${"${await req.json()}"}\`;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ sample });
      }
    `;
    const unsafeNestedBodyReaderSource = `
      export async function PATCH(req: Request) {
        const sample = \`payload: ${"${condition ? await req.clone().text() : \"\"}"}\`;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ sample });
      }
    `;
    const missingTopLevelGateSource = `
      export async function PUT(req: Request) {
        const sample = \`marker: ${"${requireApiRole(currentOrg, MembershipRole.ADMIN)}"}\`;
        return Response.json({ sample });
      }
    `;
    const safeTemplateTextSource = `
      export async function POST(req: Request) {
        const sample = \`await req.json() requireApiRole(currentOrg, MembershipRole.ADMIN)\`;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ sample });
      }
    `;
    const safeAfterGateSource = `
      export async function POST(req: Request) {
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const sample = \`payload: ${"${await req.formData()}"}\`;
        return Response.json({ sample });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeBodyReaderSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeNestedBodyReaderSource, "PATCH")).toBe(true);
    expect(exportedMutatingMethodHasRoleGate(missingTopLevelGateSource, "PUT")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeTemplateTextSource, "POST")).toBe(false);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeAfterGateSource, "POST")).toBe(false);
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

  it("ignores non-code braces while extracting mutating handler bodies", () => {
    const unsafeStringBraceSource = `
      export async function POST(req: Request) {
        const marker = "}";
        const payload = await req.json();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ marker, payload });
      }
    `;
    const unsafeCommentBraceSource = `
      export async function PATCH(req: Request) {
        /* } */
        const payload = await req.clone().text();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeTemplateBraceSource = `
      export async function PUT(req: Request) {
        const marker = \`}\`;
        const payload = await req.formData();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ marker, ok: Boolean(payload) });
      }
    `;
    const safeTemplateInterpolationSource = `
      export async function POST(req: Request) {
        const sample = \`marker: ${"${\"}\"}"}\`;
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req.blob();
        return Response.json({ sample, size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeStringBraceSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCommentBraceSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeTemplateBraceSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeTemplateInterpolationSource, "POST")).toBe(false);
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
