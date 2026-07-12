import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serializePublicApiOpenApiDocument } from "@/lib/public-api/openapi";

export const PUBLIC_API_OPENAPI_ARTIFACT = "public/openapi/v1.json";

const artifactPath = resolve(process.cwd(), PUBLIC_API_OPENAPI_ARTIFACT);
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, serializePublicApiOpenApiDocument(), "utf8");

console.log(`Generated ${PUBLIC_API_OPENAPI_ARTIFACT}.`);
