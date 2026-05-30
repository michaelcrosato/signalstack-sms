import Redis from "ioredis";
import { logger, type RateLimitEnvironment } from "./api-rate-limit";

let redisClient: Redis | null = null;
let redisClientUrl: string | undefined = undefined;

export function getRedisRateLimitClientImpl(env: RateLimitEnvironment): Redis | null {
  if (env.REDIS_RATE_LIMIT_ENABLED !== "true" || !env.REDIS_URL) {
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {
        // Safe ignore
      }
      redisClient = null;
      redisClientUrl = undefined;
    }
    return null;
  }

  if (redisClient && redisClientUrl === env.REDIS_URL) {
    return redisClient;
  }

  try {
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {
        // Safe ignore
      }
    }
    
    redisClientUrl = env.REDIS_URL;
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1, // Fail fast to trigger in-memory fallback
      enableOfflineQueue: false // Do not queue commands while offline
    });
    
    redisClient.on("error", (err) => {
      logger.warn("redis_rate_limit_client_error", { error: err.message });
    });

    return redisClient;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("redis_rate_limit_client_init_failed", { error: msg });
    return null;
  }
}
