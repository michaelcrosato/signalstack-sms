import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicApiOpenApiDocument,
  serializePublicApiOpenApiDocument,
  type PublicApiOpenApiDocument
} from "@/lib/public-api/openapi";
import {
  PUBLIC_API_HTTP_METHODS,
  PUBLIC_API_OPERATIONS,
  publicApiOperationKey,
  type PublicApiHttpMethod
} from "@/lib/public-api/openapi-registry";

const OPENAPI_ARTIFACT = "public/openapi/v1.json";
const ROUTE_ROOT = "app/api/v1";

type RouteOperation = Readonly<{
  method: PublicApiHttpMethod;
  path: string;
  file: string;
}>;

export function checkPublicApiOpenApi(rootDirectory = process.cwd()): void {
  const document = createPublicApiOpenApiDocument();
  assertOpenApiBasics(document);
  assertRouteCoverage(rootDirectory);
  assertArtifactCurrent(rootDirectory);
}

export function discoverPublicApiRouteOperations(rootDirectory = process.cwd()): RouteOperation[] {
  const routeRoot = resolve(rootDirectory, ROUTE_ROOT);
  if (!existsSync(routeRoot)) {
    throw new Error(`Public API route root is missing: ${ROUTE_ROOT}`);
  }

  const routeFiles = collectRouteFiles(routeRoot);
  return routeFiles.flatMap((routeFile) => {
    const source = readFileSync(routeFile, "utf8");
    const methods = new Set<PublicApiHttpMethod>();
    const functionPattern =
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    const constantPattern =
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;
    for (const pattern of [functionPattern, constantPattern]) {
      for (const match of source.matchAll(pattern)) {
        const method = match[1]?.toLowerCase();
        if (isPublicApiHttpMethod(method)) methods.add(method);
      }
    }
    for (const exportedNames of source.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const exportBinding of exportedNames[1]?.split(",") ?? []) {
        const normalizedBinding = exportBinding.trim();
        const alias = /^(\w+)\s+as\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.exec(
          normalizedBinding
        );
        // Every unsupported verb is an explicit alias to the canonical 405 handler. It is an
        // executable Route Handler export, but not an OpenAPI operation implementation.
        if (alias?.[1] === "methodNotAllowed" || alias?.[1] === "notFound") continue;
        const exportedName = alias?.[2] ??
          /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.exec(normalizedBinding)?.[1];
        const method = exportedName?.toLowerCase();
        if (isPublicApiHttpMethod(method)) methods.add(method);
      }
    }
    const path = routeFileToOpenApiPath(routeRoot, routeFile);
    return [...methods].map((method) => ({
      method,
      path,
      file: relative(rootDirectory, routeFile).split(sep).join("/")
    }));
  });
}

export function assertRouteCoverage(rootDirectory = process.cwd()): void {
  const registered = new Map(
    PUBLIC_API_OPERATIONS.map((operation) => [publicApiOperationKey(operation), operation])
  );
  if (registered.size !== PUBLIC_API_OPERATIONS.length) {
    throw new Error("The public API registry contains a duplicate method/path pair.");
  }

  const discovered = discoverPublicApiRouteOperations(rootDirectory);
  const implemented = new Map(
    discovered.map((operation) => [
      publicApiOperationKey({ method: operation.method, path: operation.path as `/api/v1/${string}` }),
      operation
    ])
  );
  if (implemented.size !== discovered.length) {
    throw new Error("The App Router public API contains a duplicate method/path implementation.");
  }

  const undocumented = [...implemented.entries()]
    .filter(([key]) => !registered.has(key))
    .map(([key, operation]) => `${key} (${operation.file})`);
  const unimplemented = [...registered.keys()].filter((key) => !implemented.has(key));

  if (undocumented.length > 0 || unimplemented.length > 0) {
    const lines = ["OpenAPI route coverage drift detected."];
    if (undocumented.length > 0) {
      lines.push(`Implemented but not registered:\n- ${undocumented.join("\n- ")}`);
    }
    if (unimplemented.length > 0) {
      lines.push(`Registered but missing a route handler:\n- ${unimplemented.join("\n- ")}`);
    }
    throw new Error(lines.join("\n"));
  }
}

export function assertOpenApiBasics(document: PublicApiOpenApiDocument): void {
  if (document.openapi !== "3.1.0") {
    throw new Error("The public API document must use OpenAPI 3.1.0.");
  }
  if (!isObject(document.info) || typeof document.info.title !== "string") {
    throw new Error("The OpenAPI info object is incomplete.");
  }
  if (!isObject(document.components) || !isObject(document.components.schemas)) {
    throw new Error("The OpenAPI components.schemas registry is missing.");
  }

  const operationIds = new Set<string>();
  for (const registration of PUBLIC_API_OPERATIONS) {
    const pathItem = document.paths[registration.path];
    if (!isObject(pathItem)) {
      throw new Error(`OpenAPI path is missing: ${registration.path}`);
    }
    const operation = pathItem[registration.method];
    if (!isObject(operation)) {
      throw new Error(`OpenAPI method is missing: ${publicApiOperationKey(registration)}`);
    }
    if (operation.operationId !== registration.operationId) {
      throw new Error(`OpenAPI operationId drifted for ${publicApiOperationKey(registration)}.`);
    }
    assertUniqueOperationId(operationIds, registration.operationId);
    assertOperationContract(registration, operation);

    if (!(registration.responseSchema in document.components.schemas)) {
      throw new Error(`Response schema is not registered: ${registration.responseSchema}`);
    }
    if (
      registration.requestSchema &&
      !(registration.requestSchema in document.components.schemas)
    ) {
      throw new Error(`Request schema is not registered: ${registration.requestSchema}`);
    }
  }

  for (const webhookOperation of collectWebhookOperations(document.webhooks)) {
    if (typeof webhookOperation.operationId !== "string") {
      throw new Error("Every OpenAPI webhook operation requires an operationId.");
    }
    assertUniqueOperationId(operationIds, webhookOperation.operationId);
  }

  assertLocalReferencesResolve(document);
  const serialized = JSON.stringify(document);
  if (!isObject(JSON.parse(serialized))) {
    throw new Error("The generated OpenAPI document is not valid JSON.");
  }
}

function assertArtifactCurrent(rootDirectory: string): void {
  const artifactPath = resolve(rootDirectory, OPENAPI_ARTIFACT);
  if (!existsSync(artifactPath)) {
    throw new Error(`OpenAPI artifact is missing. Run npm run openapi:generate.`);
  }
  const committed = readFileSync(artifactPath, "utf8");
  JSON.parse(committed);
  const generated = serializePublicApiOpenApiDocument();
  if (committed !== generated) {
    throw new Error(`OpenAPI artifact drifted. Run npm run openapi:generate and commit ${OPENAPI_ARTIFACT}.`);
  }
}

function assertOperationContract(
  registration: (typeof PUBLIC_API_OPERATIONS)[number],
  operation: OpenApiObject
): void {
  if (registration.public) {
    if (registration.path !== "/api/v1/openapi.json" || registration.method !== "get") {
      throw new Error("GET /api/v1/openapi.json must remain the only public registry operation.");
    }
    if (!Array.isArray(operation.security) || operation.security.length !== 0) {
      throw new Error("The OpenAPI metadata operation must explicitly declare no security.");
    }
  } else {
    const security = operation.security;
    if (
      !Array.isArray(security) ||
      security.length !== 1 ||
      !isObject(security[0]) ||
      !Array.isArray(security[0].BearerAuth)
    ) {
      throw new Error(`${registration.operationId} must require BearerAuth.`);
    }
    if (
      JSON.stringify(operation["x-required-scopes"]) !== JSON.stringify(registration.scopes)
    ) {
      throw new Error(`${registration.operationId} required scopes drifted.`);
    }
  }

  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  if (registration.method !== "get" && !hasParameterRef(parameters, "IdempotencyKey")) {
    throw new Error(`${registration.operationId} must document Idempotency-Key.`);
  }
  if (registration.paginated) {
    if (!hasParameterRef(parameters, "Limit") || !hasParameterRef(parameters, "Cursor")) {
      throw new Error(`${registration.operationId} must document cursor pagination.`);
    }
  }
}

type OpenApiObject = Record<string, unknown>;

function hasParameterRef(parameters: readonly unknown[], componentName: string): boolean {
  return parameters.some(
    (parameter) =>
      isObject(parameter) && parameter.$ref === `#/components/parameters/${componentName}`
  );
}

function collectWebhookOperations(webhooks: OpenApiObject): OpenApiObject[] {
  const operations: OpenApiObject[] = [];
  for (const pathItem of Object.values(webhooks)) {
    if (!isObject(pathItem)) continue;
    for (const method of PUBLIC_API_HTTP_METHODS) {
      const operation = pathItem[method];
      if (isObject(operation)) operations.push(operation);
    }
  }
  return operations;
}

function assertUniqueOperationId(operationIds: Set<string>, operationId: string): void {
  if (operationIds.has(operationId)) {
    throw new Error(`Duplicate OpenAPI operationId: ${operationId}`);
  }
  operationIds.add(operationId);
}

function assertLocalReferencesResolve(document: PublicApiOpenApiDocument): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
      const segments = value.$ref
        .slice(2)
        .split("/")
        .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
      let target: unknown = document;
      for (const segment of segments) {
        if (!isObject(target) || !(segment in target)) {
          throw new Error(`Unresolved OpenAPI reference: ${value.$ref}`);
        }
        target = target[segment];
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
}

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

function routeFileToOpenApiPath(routeRoot: string, routeFile: string): string {
  const relativeDirectory = relative(routeRoot, dirname(routeFile));
  const segments = relativeDirectory === "" ? [] : relativeDirectory.split(sep);
  const normalized = segments.map((segment) => {
    const dynamic = /^\[([^\]]+)\]$/.exec(segment);
    return dynamic?.[1] ? `{${dynamic[1]}}` : segment;
  });
  return `/api/v1${normalized.length > 0 ? `/${normalized.join("/")}` : ""}`;
}

function isPublicApiHttpMethod(value: unknown): value is PublicApiHttpMethod {
  return (
    typeof value === "string" &&
    (PUBLIC_API_HTTP_METHODS as readonly string[]).includes(value)
  );
}

function isObject(value: unknown): value is OpenApiObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  try {
    checkPublicApiOpenApi();
    console.log(`OpenAPI check passed (${PUBLIC_API_OPERATIONS.length} route operations).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
