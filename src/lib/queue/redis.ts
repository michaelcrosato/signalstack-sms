export type RedisQueueConfig = {
  redisUrl?: string;
};

export function getRedisQueueConfig(env: Record<string, string | undefined> = process.env): RedisQueueConfig {
  return {
    redisUrl: env.REDIS_URL
  };
}

export function redisConnectionFromUrl(redisUrl: string) {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? Number.parseInt(parsed.pathname.slice(1), 10) : undefined
  };
}
