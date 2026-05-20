# Testing

Milestone 0 validation runs:

- Contract presence, API documentation drift, and tenant `orgId` invariant checks
- Secret/default safety check
- ESLint
- TypeScript
- Prisma validation and client generation
- Vitest smoke
- Playwright smoke
- Next build

Additional deterministic checks:

- `npm run test:e2e:demo` runs the investor demo path after the local database has been migrated and seeded.
- `npm run worker` processes local due scheduled campaign jobs through the dummy provider only.
