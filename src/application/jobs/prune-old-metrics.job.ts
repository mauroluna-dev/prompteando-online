import type { ApiKeyMetricsRepository } from "@/application/ports/api-key-metrics-repository.port";
import { CONSTANTS } from "@/domain/api-key";

/**
 * P18 — Trims rows older than retention from `api_key_metrics_daily`.
 * Run weekly. Idempotent — running twice does no extra work.
 */
export class PruneOldMetricsJob {
  constructor(private readonly metricsRepo: ApiKeyMetricsRepository) {}

  async run(): Promise<{ deleted: number }> {
    const deleted = await this.metricsRepo.deleteOlderThan(
      CONSTANTS.METRICS_DAILY_RETENTION_DAYS,
    );
    return { deleted };
  }
}
