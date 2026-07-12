import { getRuntimeConfig } from "@/lib/env/runtime-config";

const config = getRuntimeConfig();

console.log(
  [
    "Runtime configuration valid",
    `environment=${config.runtime.environment}`,
    `process=${config.runtime.process}`,
    `demoMode=${config.runtime.demoMode}`,
    `auth=${config.auth.mode}`,
    `provider=${config.provider.name}`,
    `queue=${config.queue.backend}`,
    `backups=${config.backup.enabled}`
  ].join("; ")
);
