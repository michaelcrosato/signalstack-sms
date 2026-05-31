# 002_query_optimization

## Goal
Optimize the analytics query layer to eliminate redundant scatter-gather sequential requests and missing database indexes.

## Steps
1. Add an index for `[orgId, direction]` and `[orgId, providerStatus]` to the Message model in `prisma/schema.prisma`.
2. Generate the new Prisma client and run migrations (if required, or just push since we are local).
3. Refactor `lib/analytics/overview.ts` to use `prisma.message.groupBy` where appropriate, reducing the 14 sequential `count` calls into batched aggregates.
4. Run `VERIFY_CMD` to validate.
