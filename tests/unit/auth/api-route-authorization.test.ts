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
      .replace(/\(\s*globalThis\s+(?:as|satisfies)\s+typeof\s+globalThis\s*\)/g, "globalThis")
      .replace(/\(\s*Request\s+(?:as|satisfies)\s+typeof\s+Request\s*\)/g, "Request")
      .replace(
        /\(\s*(Request\s*(?:\.|\?\.)\s*prototype)\s+(?:as|satisfies)\s+typeof\s+Request\s*\.\s*prototype\s*\)/g,
        "$1"
      )
      .replace(
        /\(\s*(globalThis\s*(?:\.|\?\.)\s*(?:Object|Reflect|Request))\s+(?:as|satisfies)\s+typeof\s+(?:Object|Reflect|Request)\s*\)/g,
        "$1"
      )
      .replace(
        /\(\s*(globalThis\s*(?:\?\.)?\[\s*["'`](?:Object|Reflect|Request)["'`]\s*\])\s+(?:as|satisfies)\s+typeof\s+(?:Object|Reflect|Request)\s*\)/g,
        "$1"
      )
      .replace(/\(\s*globalThis\s*\)/g, "globalThis")
      .replace(/\(\s*(Object|Reflect|Request)\s*\)/g, "$1")
      .replace(
        /\b(Object|Reflect|Request|globalThis)\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\)|\s+(?:as|satisfies)\s+typeof\b)/g,
        "$1"
      );
    normalizedGlobalThisBodySlice = normalizedGlobalThisBodySlice
      .replace(/\(\s*(globalThis\s*(?:\.|\?\.)\s*(?:Object|Reflect|Request))\s*\)/g, "$1")
      .replace(/\(\s*(globalThis\s*(?:\?\.)?\[\s*["'`](?:Object|Reflect|Request)["'`]\s*\])\s*\)/g, "$1")
      .replace(/\(\s*(Request\s*(?:\.|\?\.)\s*prototype)\s*\)/g, "$1")
      .replace(/\(\s*(Request\s*(?:\?\.)?\[\s*["'`]prototype["'`]\s*\])\s*\)/g, "$1")
      .replace(
        /(\bglobalThis\s*(?:\.|\?\.)\s*Request)\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\)|\s+(?:as|satisfies)\s+typeof\b)/g,
        "$1"
      )
      .replace(
        /(\bglobalThis\s*(?:\?\.)?\[\s*["'`]Request["'`]\s*\])\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\)|\s+(?:as|satisfies)\s+typeof\b)/g,
        "$1"
      )
      .replace(
        /(\bRequest\s*(?:\.|\?\.)\s*prototype)\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\)|\s+(?:as|satisfies)\s+typeof\b)/g,
        "$1"
      )
      .replace(
        /(\bRequest\s*(?:\?\.)?\[\s*["'`]prototype["'`]\s*\])\s*!\s*(?=\.|\?\.|\[|,|;|\r?\n|\)|\s+(?:as|satisfies)\s+typeof\b)/g,
        "$1"
      );
  } while (normalizedGlobalThisBodySlice !== previousGlobalThisBodySlice);

  const builtInPropertyAliases = new Map<string, string>();
  const globalThisAliases = new Set<string>();
  const optionalNonNullAssertionPattern = "(?:\\s*!\\s*)?";
  const simpleSequenceExpressionPrefixPattern =
    "(?:\\(+\\s*(?:void\\s+0|undefined|null|0|false|true)\\s*,\\s*)*";
  let discoveredGlobalThisAlias = true;
  while (discoveredGlobalThisAlias) {
    discoveredGlobalThisAlias = false;
    const globalThisAliasTargets =
      globalThisAliases.size > 0 ? `globalThis|${[...globalThisAliases].map(escapeRegExp).join("|")}` : "globalThis";
    const globalThisAliasReferencePattern = `\\(*\\s*(?:${globalThisAliasTargets})${optionalNonNullAssertionPattern}\\s*\\)*${optionalNonNullAssertionPattern}(?:\\s+(?:as|satisfies)\\s+typeof\\s+globalThis)?\\s*\\)*${optionalNonNullAssertionPattern}\\s*\\)*`;
    const conditionalGlobalThisAliasValuePattern = `\\(*\\s*(?:[A-Za-z_$][\\w$]*|true|false)\\s*\\?\\s*${globalThisAliasReferencePattern}\\s*:\\s*${globalThisAliasReferencePattern}\\s*\\)*`;
    const logicalExpressionGlobalThisAliasValuePattern = `\\(*\\s*${globalThisAliasReferencePattern}\\s*(?:\\|\\||&&|\\?\\?)\\s*${globalThisAliasReferencePattern}\\s*\\)*`;
    const globalThisAliasValuePattern = `${simpleSequenceExpressionPrefixPattern}(?:${conditionalGlobalThisAliasValuePattern}|${logicalExpressionGlobalThisAliasValuePattern}|${globalThisAliasReferencePattern})`;
    const globalThisAliasPattern = new RegExp(
      `(?:\\b(?:const|let|var)\\s+|,\\s*)([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${globalThisAliasValuePattern}\\s*(?=,|;|\\r?\\n)`,
      "g"
    );
    const assignedGlobalThisAliasPattern = new RegExp(
      `(?:^|[;,\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${globalThisAliasValuePattern}\\s*(?=,|;|\\r?\\n)`,
      "g"
    );
    const logicalAssignedGlobalThisAliasPattern = new RegExp(
      `(?:^|[;,\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*(?:\\?\\?=|\\|\\|=|&&=)\\s*${globalThisAliasValuePattern}\\s*(?=,|;|\\r?\\n)`,
      "g"
    );
    const parenthesizedAssignedGlobalThisAliasPattern = new RegExp(
      `(?:^|[;,\\r\\n])\\s*\\(+\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${globalThisAliasValuePattern}\\s*\\)+\\s*(?=,|;|\\r?\\n)`,
      "g"
    );
    const parenthesizedLogicalAssignedGlobalThisAliasPattern = new RegExp(
      `(?:^|[;,\\r\\n])\\s*\\(+\\s*([A-Za-z_$][\\w$]*)\\s*(?:\\?\\?=|\\|\\|=|&&=)\\s*${globalThisAliasValuePattern}\\s*\\)+\\s*(?=,|;|\\r?\\n)`,
      "g"
    );
    for (const match of [
      ...normalizedGlobalThisBodySlice.matchAll(globalThisAliasPattern),
      ...normalizedGlobalThisBodySlice.matchAll(assignedGlobalThisAliasPattern),
      ...normalizedGlobalThisBodySlice.matchAll(logicalAssignedGlobalThisAliasPattern),
      ...normalizedGlobalThisBodySlice.matchAll(parenthesizedAssignedGlobalThisAliasPattern),
      ...normalizedGlobalThisBodySlice.matchAll(parenthesizedLogicalAssignedGlobalThisAliasPattern)
    ]) {
      if (!globalThisAliases.has(match[1])) {
        globalThisAliases.add(match[1]);
        discoveredGlobalThisAlias = true;
      }
    }
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
  const globalThisTargetWithOptionalTypeAssertionPattern = () =>
    `${simpleSequenceExpressionPrefixPattern}\\(*\\s*${globalThisTargetPattern()}${optionalNonNullAssertionPattern}\\s*\\)*${optionalNonNullAssertionPattern}(?:\\s+(?:as|satisfies)\\s+typeof\\s+globalThis)?\\s*\\)*${optionalNonNullAssertionPattern}\\s*\\)*`;
  const withoutDestructuringDefault = (field: string) => field.replace(/\s*=\s*[\s\S]*$/, "");
  const collectGlobalThisBuiltInAliases = (fields: string) =>
    fields.split(",").flatMap((field) => {
      const fieldWithoutDefault = withoutDestructuringDefault(field);
      const fieldMatch = /^\s*(Object|Reflect)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(fieldWithoutDefault);
      if (fieldMatch !== null) {
        return [[fieldMatch[2] ?? fieldMatch[1], fieldMatch[1]]] as const;
      }

      const computedLiteralMatch = /^\s*\[\s*["'`](Object|Reflect)["'`]\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(
        fieldWithoutDefault
      );
      if (computedLiteralMatch !== null) {
        return [[computedLiteralMatch[2], computedLiteralMatch[1]]] as const;
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(
        fieldWithoutDefault
      );
      const builtInName = computedAliasMatch === null ? undefined : builtInPropertyAliases.get(computedAliasMatch[1]);
      return builtInName === undefined || computedAliasMatch === null ? [] : ([[computedAliasMatch[2], builtInName]] as const);
    });
  const builtInObjectAliases = new Map<string, string>();
  const destructuredGlobalThisBuiltInAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredGlobalThisBuiltInAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*\\)\\s*(?=;|\\r?\\n)`,
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
  const directGlobalThisBuiltInObjectAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*(?:(?:\\.|\\?\\.)\\s*(Object|Reflect)|(?:\\?\\.)?\\[\\s*${literalBuiltInNamePattern}\\s*\\])(?:\\s+(?:as|satisfies)\\s+typeof\\s+(?:Object|Reflect))?${variableDeclaratorEnd}`,
    "g"
  );
  const assignedGlobalThisBuiltInObjectAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*(?:(?:\\.|\\?\\.)\\s*(Object|Reflect)|(?:\\?\\.)?\\[\\s*${literalBuiltInNamePattern}\\s*\\])(?:\\s+(?:as|satisfies)\\s+typeof\\s+(?:Object|Reflect))?\\s*(?=;|\\r?\\n)`,
    "g"
  );
  for (const match of [
    ...normalizedGlobalThisBodySlice.matchAll(directBuiltInObjectAliasPattern),
    ...normalizedGlobalThisBodySlice.matchAll(assignedBuiltInObjectAliasPattern)
  ]) {
    builtInObjectAliases.set(match[1], match[2]);
  }
  for (const match of [
    ...normalizedGlobalThisBodySlice.matchAll(directGlobalThisBuiltInObjectAliasPattern),
    ...normalizedGlobalThisBodySlice.matchAll(assignedGlobalThisBuiltInObjectAliasPattern)
  ]) {
    builtInObjectAliases.set(match[1], match[2] ?? match[3]);
  }
  for (const [propertyAlias, builtInName] of builtInPropertyAliases) {
    const directComputedGlobalThisBuiltInAliasPattern = new RegExp(
      `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*(?:\\?\\.)?\\[\\s*${escapeRegExp(propertyAlias)}\\s*\\]${variableDeclaratorEnd}`,
      "g"
    );
    const assignedComputedGlobalThisBuiltInAliasPattern = new RegExp(
      `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*(?:\\?\\.)?\\[\\s*${escapeRegExp(propertyAlias)}\\s*\\]\\s*(?=;|\\r?\\n)`,
      "g"
    );
    for (const match of [
      ...normalizedGlobalThisBodySlice.matchAll(directComputedGlobalThisBuiltInAliasPattern),
      ...normalizedGlobalThisBodySlice.matchAll(assignedComputedGlobalThisBuiltInAliasPattern)
    ]) {
      builtInObjectAliases.set(match[1], builtInName);
    }
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
  const globalThisRequestConstructorAccessPattern = `${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*(?:(?:\\.|\\?\\.)\\s*Request|(?:\\?\\.)?\\[\\s*${requestConstructorPropertyPattern()}\\s*\\])\\s*!?`;
  const globalThisRequestConstructorAliasValuePattern = `\\(?\\s*${globalThisRequestConstructorAccessPattern}(?:\\s+(?:as|satisfies)\\s+typeof\\s+Request)?\\s*\\)?`;
  const requestConstructorAliasPattern = new RegExp(
    `${variableDeclaratorStart}([A-Za-z_$][\\w$]*)\\s*(?::[^=;,\\n]+)?=\\s*${globalThisRequestConstructorAliasValuePattern}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedRequestConstructorAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*${globalThisRequestConstructorAliasValuePattern}\\s*(?=;|\\r?\\n)`,
    "g"
  );
  const collectGlobalThisRequestAliases = (fields: string) =>
    fields.split(",").flatMap((field) => {
      const fieldWithoutDefault = withoutDestructuringDefault(field);
      const fieldMatch = /^\s*Request\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(fieldWithoutDefault);
      if (fieldMatch !== null) {
        return [fieldMatch[1] ?? "Request"];
      }

      const computedLiteralMatch = /^\s*\[\s*["'`]Request["'`]\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(
        fieldWithoutDefault
      );
      if (computedLiteralMatch !== null) {
        return [computedLiteralMatch[1]];
      }

      const computedAliasMatch = /^\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:\s*([A-Za-z_$][\w$]*)\s*$/.exec(
        fieldWithoutDefault
      );
      return computedAliasMatch !== null && requestConstructorPropertyAliases.has(computedAliasMatch[1])
        ? [computedAliasMatch[2]]
        : [];
    });
  const destructuredGlobalThisRequestAliasPattern = new RegExp(
    `${variableDeclaratorStart}\\{([^}]+)\\}\\s*(?::[^=;,\\n]+)?=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}${variableDeclaratorEnd}`,
    "g"
  );
  const assignedDestructuredGlobalThisRequestAliasPattern = new RegExp(
    `(?:^|[;\\r\\n])\\s*\\(\\s*\\{([^}]+)\\}\\s*=\\s*${globalThisTargetWithOptionalTypeAssertionPattern()}\\s*\\)\\s*(?=;|\\r?\\n)`,
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
    .replace(new RegExp(`\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\]`, "g"), (match, propertyAlias: string, offset: number, source: string) => {
      const readerName = bodyReaderPropertyAliases.get(propertyAlias);
      const nextNonWhitespace = source.slice(offset + match.length).match(/\S/)?.[0];
      return readerName === undefined || nextNonWhitespace === ":" ? match : `.${readerName}`;
    })
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

  it("treats direct request body-reader property aliases as body parsing for role-gate ordering", () => {
    const unsafePropertyAliasSource = `
      export async function POST(req: Request) {
        const readerName = "json";
        const payload = await req[readerName]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeOptionalPropertyAliasSource = `
      export async function PATCH(req: Request) {
        const readerName = "text" as const;
        const payload = await req?.[readerName]?.();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const unsafeClonePropertyAliasSource = `
      export async function PUT(req: Request) {
        const readerName = "formData";
        const payload = await req.clone?.()?.[readerName]?.();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const safePropertyAliasSource = `
      export async function DELETE(req: Request) {
        const readerName = "blob";
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await req[readerName]();
        return Response.json({ size: payload.size });
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafePropertyAliasSource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeOptionalPropertyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeClonePropertyAliasSource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safePropertyAliasSource, "DELETE")).toBe(false);
  });

  it("treats direct request aliases with body-reader property aliases as body parsing for role-gate ordering", () => {
    const unsafeRequestAliasPropertySource = `
      export async function POST(req: Request) {
        const bodySource = req;
        const readerName = "json";
        const payload = await bodySource[readerName]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json(payload);
      }
    `;
    const unsafeAssignedPropertyAliasSource = `
      export async function PATCH(req: Request) {
        let readerName;
        readerName = "arrayBuffer";
        const payload = await req[readerName]?.call(req);
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ size: payload.byteLength });
      }
    `;
    const unsafeCloneAliasPropertySource = `
      export async function PUT(req: Request) {
        const bodySource = req;
        const cloned = bodySource.clone();
        const readerName = ("text");
        const payload = await cloned[readerName]();
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        return Response.json({ payload });
      }
    `;
    const safeRequestAliasPropertySource = `
      export async function DELETE(req: Request) {
        const bodySource = req;
        const readerName = "formData";
        const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
        if (roleResponse) return roleResponse;
        const payload = await bodySource[readerName]();
        return Response.json(payload);
      }
    `;

    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeRequestAliasPropertySource, "POST")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeAssignedPropertyAliasSource, "PATCH")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(unsafeCloneAliasPropertySource, "PUT")).toBe(true);
    expect(mutatingMethodParsesBodyBeforeRoleGate(safeRequestAliasPropertySource, "DELETE")).toBe(false);
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
});
