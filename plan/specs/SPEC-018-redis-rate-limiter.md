# SPEC-018 — Distributed Redis-Backed Rate Limiter

- **Status:** Todo · **Priority:** P2 · **Pillar:** Quality · **Effort:** M

## Description
Replace or supplement the existing in-memory rate limiter with a distributed Redis-backed rate limiter to prevent race conditions and enforce rate limits accurately across multiple application nodes in production. If Redis is unavailable or the feature flag is disabled, it must fall back gracefully to the existing in-memory rate limiter.

## Prereqs / deps
Requires `REDIS_URL` config. Reuses the Redis connection seam from BullMQ (`lib/queue/redis.ts`).

## Implementation approach
1. Extend `lib/rate-limit/api-rate-limit.ts` to support both in-memory and Redis rate limiting.
2. Introduce a new environment flag `REDIS_RATE_LIMIT_ENABLED` (defaulting to `false` for demo-safety).
3. If `REDIS_RATE_LIMIT_ENABLED=true` and `REDIS_URL` is set, connect to Redis and use standard atomic operations (e.g., `MULTI`, `INCR`, `EXPIRE`, or Lua script) to implement a fixed-window rate limiter matching the current in-memory behavior and headers.
4. If Redis connection fails or is missing, or the flag is disabled, gracefully fall back to the `globalRateLimitStore` (in-memory Map) and log a warning.
5. Create comprehensive unit tests verifying Redis rate limiting under mock and real Redis connections (if available), correct header returns, and seamless fallback to the in-memory store.

## Acceptance criteria
- [ ] Distributed rate limiting is enabled only when `REDIS_RATE_LIMIT_ENABLED=true`.
- [ ] Connects safely to Redis using the existing `redisConnectionFromUrl` or Redis client.
- [ ] Gracefully falls back to the in-memory rate limiter if Redis is disabled, connection fails, or configuration is missing.
- [ ] Returns correct standard RFC rate-limiting headers matching `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After`.
- [ ] `npm run validate` runs and exits 0.

## Test strategy
- Unit tests in `tests/unit/rate-limit/redis-rate-limit.test.ts` covering success paths, mock Redis client responses, error conditions, and graceful in-memory fallbacks.
