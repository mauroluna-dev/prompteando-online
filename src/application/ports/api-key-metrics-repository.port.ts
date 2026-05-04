import type { ApiKeyMetricsDaily } from "@/domain/api-key";

/**
 * P18 — Persistence port for the daily metrics snapshots.
 * Postgres-backed in prod (PostgresApiKeyMetricsRepository).
 */
export interface ApiKeyMetricsRepository {
  /**
   * Insert or update one (apiKeyId, day) row. PRIMARY KEY enforces
   * uniqueness; behavior is UPSERT so the consolidate cron can be
   * re-run idempotently.
   */
  upsert(daily: ApiKeyMetricsDaily): Promise<void>;

  /**
   * Inclusive on both bounds. Returns rows ordered ascending by day.
   * Days with no row are omitted (caller fills gaps if needed).
   */
  findRange(
    apiKeyId: string,
    fromDay: string,
    toDay: string,
  ): Promise<ApiKeyMetricsDaily[]>;

  /**
   * Delete rows older than `retentionDays`. Returns the number of
   * rows deleted. Called by the prune cron weekly.
   */
  deleteOlderThan(retentionDays: number): Promise<number>;
}
