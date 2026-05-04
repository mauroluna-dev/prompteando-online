/**
 * P18 — Cron entrypoint: drain yesterday's API key usage counters
 * from Redis into the persisted daily snapshot table.
 *
 * Usage:
 *   bun run cron:consolidate-metrics              # default: --day=yesterday UTC
 *   bun run cron:consolidate-metrics --day=2026-05-03
 *
 * Schedule in production: daily at 00:05 UTC (give the previous
 * day's last-second writes a few minutes to land before draining).
 *
 * Exit code: 0 if the job completed (even with per-key errors),
 * 1 if the job itself crashed before completing.
 */
import { ConsolidateApiKeyMetricsJob } from "@/application/jobs/consolidate-api-key-metrics.job";
import { BunRedisMetricsCounter } from "@/infrastructure/cache/bun-redis-metrics-counter.adapter";
import { db } from "@/infrastructure/persistence/db";
import { PostgresApiKeyRepository } from "@/infrastructure/persistence/repositories/postgres-api-key.repository";
import { PostgresApiKeyMetricsRepository } from "@/infrastructure/persistence/repositories/postgres-api-key-metrics.repository";

const dayArg = process.argv
  .find((arg) => arg.startsWith("--day="))
  ?.split("=")[1];

const job = new ConsolidateApiKeyMetricsJob(
  new PostgresApiKeyRepository(db),
  new BunRedisMetricsCounter(),
  new PostgresApiKeyMetricsRepository(db),
);

try {
  const result = await job.run(dayArg ? { day: dayArg } : {});
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      job: "consolidate-api-key-metrics",
      day: dayArg ?? "yesterday-utc",
      ...result,
    }),
  );
  process.exit(0);
} catch (err) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      job: "consolidate-api-key-metrics",
      day: dayArg ?? "yesterday-utc",
      fatal: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
}
