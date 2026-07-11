import { readFileSync } from "node:fs";

type RequiredText = {
  file: string;
  text: string;
};

const requiredTexts: RequiredText[] = [
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "does not authorize live SMS"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "Current supported auth modes: explicit demo and built-in local"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "resolveLocalSession"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "getDemoSession"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "requireApiRole"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "Route RBAC Matrix"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "lib/auth/api-rbac-matrix.ts"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "shared authentication boundary"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "Active membership status must be enforced before tenant data access"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "AUTH_SESSION_SECRET"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "TRUST_PROXY=true"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "Clerk secrets and publishable keys remain absent"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "CLERK_AUTH_CONFIG_PRESENT"
  },
  {
    file: "docs/PRODUCTION_DEPLOYMENT.md",
    text: "docs/PRODUCTION_AUTH_RBAC.md"
  },
  {
    file: "docs/PRODUCTION_GO_LIVE.md",
    text: "docs/PRODUCTION_AUTH_RBAC.md"
  },
  {
    file: "docs/LOCAL_GATE.md",
    text: "npm run production-auth:check"
  },
  {
    file: "lib/deployment/production-gate.ts",
    text: "CLERK_AUTH_CONFIG_PRESENT"
  },
  {
    file: "tests/unit/deployment/production-gate.test.ts",
    text: "CLERK_AUTH_CONFIG_PRESENT"
  },
  {
    file: "lib/auth/current-org.ts",
    text: "getDemoSession"
  },
  {
    file: "lib/auth/current-org.ts",
    text: "demoMode: true"
  },
  {
    file: "lib/auth/api-authorization.ts",
    text: "getRoleAuthorizationError"
  },
  {
    file: "lib/auth/api-rbac-matrix.ts",
    text: "apiRouteRbacMatrix"
  },
  {
    file: "tests/unit/auth/api-rbac-matrix.test.ts",
    text: "declares every mutating API route method exactly once"
  },
  {
    file: "lib/auth/roles.ts",
    text: "roleRank"
  },
  {
    file: "scripts/validate.ts",
    text: "\"production-auth:check\""
  },
  {
    file: "package.json",
    text: "\"production-auth:check\": \"tsx scripts/production-auth-rbac-check.ts\""
  },
  // Legacy optional external-identity seam stays flag-gated and fail-closed (no provider calls).
  {
    file: "lib/auth/session.ts",
    text: "PRODUCTION_AUTH_ENABLED"
  },
  {
    file: "lib/auth/session.ts",
    text: "resolveProductionCurrentOrg"
  },
  {
    file: "lib/auth/session.ts",
    text: "Fail closed"
  },
  {
    file: "docs/PRODUCTION_AUTH_RBAC.md",
    text: "resolveProductionCurrentOrg"
  },
  {
    file: "tests/unit/auth/session.test.ts",
    text: "resolveProductionCurrentOrg"
  },
  {
    file: ".env.example",
    text: "PRODUCTION_AUTH_ENABLED=false"
  }
];

const failures = requiredTexts.flatMap(({ file, text }) => {
  const contents = readFileSync(file, "utf8");
  return contents.includes(text) ? [] : [`${file} is missing required production auth/RBAC text: ${text}`];
});

if (failures.length > 0) {
  console.error("Production auth/RBAC check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production auth/RBAC contract verified.");
