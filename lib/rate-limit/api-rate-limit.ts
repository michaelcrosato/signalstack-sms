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

const defaultPolicy: ApiRateLimitPolicy = {
  enabled: true,
  limit: 120,
  windowMs: 60_000
};

const globalRateLimitStore: RateLimitStore = new Map();

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

export function checkApiRateLimit({
  key,
  policy,
  now = Date.now(),
  store = globalRateLimitStore
}: {
  key: string;
  policy: ApiRateLimitPolicy;
  now?: number;
  store?: RateLimitStore;
}): RateLimitResult {
  if (!policy.enabled) {
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: now + policy.windowMs,
      retryAfterSeconds: 0
    };
  }

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

export function resetApiRateLimitStore(store: RateLimitStore = globalRateLimitStore) {
  store.clear();
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
