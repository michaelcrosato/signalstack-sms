export type RedisQueueConfig = {
  redisUrl?: string;
};

export function getRedisQueueConfig(env: Record<string, string | undefined> = process.env): RedisQueueConfig {
  return {
    redisUrl: env.REDIS_URL
  };
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed percent-sequence is left as-is rather than throwing during connection setup.
    return value;
  }
}

export function redisConnectionFromUrl(redisUrl: string) {
  const parsed = new URL(redisUrl);

  // URL exposes username/password percent-encoded; ioredis needs the decoded credential, otherwise a
  // password containing @ : / or other reserved characters fails AUTH.
  const password = parsed.password ? decodeUrlComponent(parsed.password) : undefined;
  const username = parsed.username ? decodeUrlComponent(parsed.username) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    password,
    username,
    db: parsed.pathname && parsed.pathname !== "/" ? Number.parseInt(parsed.pathname.slice(1), 10) : undefined,
    // The rediss: scheme requires a TLS connection; ioredis enables TLS when a tls option is present.
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {})
  };
}
