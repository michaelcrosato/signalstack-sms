import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectImplementedEndpoints, extractExportedRouteMethods } from "@/scripts/contracts-check";

let tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

function createTempRoute(source: string, routePath = ["contacts", "[contactId]"]) {
  const root = mkdtempSync(join(tmpdir(), "signalstack-contracts-check-"));
  tempRoots.push(root);
  const routeDirectory = join(root, ...routePath);
  mkdirSync(routeDirectory, { recursive: true });
  writeFileSync(join(routeDirectory, "route.ts"), source);
  return root;
}

describe("contracts-check route method extraction", () => {
  it("detects exported function, exported const, and named-export route methods", () => {
    const source = `
      export async function GET() {
        return Response.json({});
      }

      export const POST = async (request: Request) => {
        return Response.json(await request.json());
      };

      export const PATCH: RouteHandler = async function update(request: Request) {
        return Response.json(await request.json());
      };

      async function removeContact(request: Request) {
        return Response.json(await request.json());
      }

      function PUT() {
        return Response.json({});
      }

      export function HEAD() {
        return new Response(null, { status: 204 });
      }

      const optionsHandler = () => new Response(null, { status: 204 });

      export { removeContact as DELETE, PUT, optionsHandler as OPTIONS };
    `;

    expect(extractExportedRouteMethods(source)).toEqual(["GET", "POST", "PATCH", "DELETE", "PUT", "HEAD", "OPTIONS"]);
  });

  it("collects route-method docs keys for non-function export styles", () => {
    const root = createTempRoute(`
      const createContact = async () => Response.json({});
      export const PATCH = async () => Response.json({});
      export { createContact as POST };
    `);

    expect(collectImplementedEndpoints(root)).toEqual([
      "POST /api/contacts/:contactId",
      "PATCH /api/contacts/:contactId"
    ]);
  });

  it("ignores route method export mentions in comments and strings", () => {
    const source = `
      // export async function POST() {}
      /*
        export const PATCH = async () => Response.json({});
        export { removeContact as DELETE };
      */
      const example = "export function PUT() {}";
      const template = \`export { optionsHandler as OPTIONS }\`;

      export async function GET() {
        return Response.json({});
      }

      export function HEAD() {
        return new Response(null, { status: 204 });
      }
    `;

    expect(extractExportedRouteMethods(source)).toEqual(["GET", "HEAD"]);
  });
});
