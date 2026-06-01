import { logger as appLogger } from "@/lib/observability/logger";

// Export logger so implementation file can consume it
export const logger = appLogger;

export type RateLimitEnvironment = Partial<Record<string, string | undefined>>;

export type ApiRateLimitPolicy = {
  enabled: boolean;
  limit: number;
  windowMs: number;
};

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = Map<string, RateLimitEntry>;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

interface RedisMultiLike {
  incr(key: string): RedisMultiLike;
  pttl(key: string): RedisMultiLike;
  exec(): Promise<unknown>;
}

interface RedisLike {
  multi(): RedisMultiLike;
  pexpire(key: string, ms: number): Promise<unknown>;
}

const defaultPolicy: ApiRateLimitPolicy = {
  enabled: true,
  limit: 120,
  windowMs: 60_000
};

const globalRateLimitStore: RateLimitStore = new Map();
let getClientImpl: ((env: RateLimitEnvironment) => unknown) | null = null;

export async function getRedisRateLimitClient(env: RateLimitEnvironment = process.env): Promise<unknown> {
  if (env.REDIS_RATE_LIMIT_ENABLED !== "true" || !env.REDIS_URL) {
    return null;
  }

  try {
    if (!getClientImpl) {
      // Use dynamic import with webpackIgnore comment to prevent Next.js from bundling ioredis in middleware
      const path = "./redis-rate-limiter-impl";
      const mod = await import(/* webpackIgnore: true */ path);
      getClientImpl = mod.getRedisRateLimitClientImpl;
    }
    
    if (getClientImpl) {
      return getClientImpl(env);
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("failed_to_load_redis_rate_limit_client", { error: msg });
    return null;
  }
}

export function getApiRateLimitPolicy(env: RateLimitEnvironment = process.env): ApiRateLimitPolicy {
  return {
    enabled: parseBoolean(env.API_RATE_LIMIT_ENABLED, defaultPolicy.enabled),
    limit: parseBoundedInteger(env.API_RATE_LIMIT_MAX, defaultPolicy.limit, 1, 10_000),
    windowMs: parseBoundedInteger(env.API_RATE_LIMIT_WINDOW_MS, defaultPolicy.windowMs, 1_000, 3_600_000)
  };
}

export function getApiRateLimitClientKey(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const connectingIp = headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || connectingIp || "local-demo-client";
}

export async function checkApiRateLimit({
  key,
  policy,
  now = Date.now(),
  store = globalRateLimitStore,
  redis,
  env = process.env
}: {
  key: string;
  policy: ApiRateLimitPolicy;
  now?: number;
  store?: RateLimitStore;
  redis?: unknown;
  env?: RateLimitEnvironment;
}): Promise<RateLimitResult> {
  if (!policy.enabled) {
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now + policy.windowMs,
      retryAfterSeconds: 0
    };
  }

  const activeRedis = redis !== undefined ? redis : await getRedisRateLimitClient(env);
  if (activeRedis) {
    try {
      const redisKey = `rate_limit:${key}`;
      const redisClientInstance = activeRedis as RedisLike;
      const multi = redisClientInstance.multi();
      multi.incr(redisKey);
      multi.pttl(redisKey);
      const results = await multi.exec();

      if (!results) {
        throw new Error("Redis multi returned null");
      }

      // ioredis exec returns: [[err, val], [err, val]]
      const [[err1, countVal], [err2, ttlVal]] = results as [[Error | null, unknown], [Error | null, unknown]];
      if (err1) throw err1;
      if (err2) throw err2;

      const count = Number(countVal);
      const ttl = Number(ttlVal);

      let remainingTtl = ttl;
      if (count === 1 || ttl < 0) {
        await redisClientInstance.pexpire(redisKey, policy.windowMs);
        remainingTtl = policy.windowMs;
      }

      const resetAt = now + Math.max(remainingTtl, 0);

      if (count > policy.limit) {
        return {
          allowed: false,
          limit: policy.limit,
          remaining: 0,
          resetAt,
          retryAfterSeconds: retryAfterSeconds(resetAt, now)
        };
      }

      return {
        allowed: true,
        limit: policy.limit,
        remaining: Math.max(policy.limit - count, 0),
        resetAt,
        retryAfterSeconds: 0
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("redis_rate_limit_failed_falling_back", { error: msg });
    }
  }

  // Fallback to in-memory store
  pruneExpiredEntries(store, now);

  const existing = store.get(key);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + policy.windowMs
        };

  if (entry.count >= policy.limit) {
    store.set(key, entry);
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: retryAfterSeconds(entry.resetAt, now)
    };
  }

  entry.count += 1;
  store.set(key, entry);

  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(policy.limit - entry.count, 0),
    resetAt: entry.resetAt,
    retryAfterSeconds: 0
  };
}

export function apiRateLimitHeaders(result: RateLimitResult): HeadersInit {
  const headers: Record<string, string> = {
    "RateLimit-Limit": result.limit.toString(),
    "RateLimit-Remaining": result.remaining.toString(),
    "RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString()
  };

  if (!result.allowed) {
    headers["Retry-After"] = result.retryAfterSeconds.toString();
  }

  return headers;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function pruneExpiredEntries(store: RateLimitStore, now: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function retryAfterSeconds(resetAt: number, now: number) {
  return Math.max(Math.ceil((resetAt - now) / 1000), 1);
}
