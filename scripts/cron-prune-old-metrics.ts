/**
 * P18 — Cron entrypoint: delete `api_key_metrics_daily` rows older
 * than the retention window (CONSTANTS.METRICS_DAILY_RETENTION_DAYS,
 * 90 days as of P18).
 *
 * Usage:
 *   bun run cron:prune-old-metrics
 *
 * Schedule in production: weekly (e.g. Sundays 00:10 UTC). Doesn't
 * need to run more often — the table grows by at most one row per
 * key per day, so a week of accumulated stale rows is negligible.
 */
import { PruneOldMetricsJob } from "@/application/jobs/prune-old-metrics.job";
import { db } from "@/infrastructure/persistence/db";
import { PostgresApiKeyMetricsRepository } from "@/infrastructure/persistence/repositories/postgres-api-key-metrics.repository";

const job = new PruneOldMetricsJob(new PostgresApiKeyMetricsRepository(db));

try {
  const result = await job.run();
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      job: "prune-old-metrics",
      ...result,
    }),
  );
  process.exit(0);
} catch (err) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      job: "prune-old-metrics",
      fatal: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
}
