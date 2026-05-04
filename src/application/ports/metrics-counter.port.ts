/**
 * P18 — In-flight per-day counters for API key usage. Backed by
 * Redis in prod (BunRedisMetricsCounter); fakeable in tests.
 *
 * `day` is always a UTC ISO date string ("YYYY-MM-DD"). Callers
 * compute it from a Clock so tests can pin the day.
 */
export interface MetricsCounter {
  /**
   * Record a single hit on the public API. Best-effort — adapter
   * implementations should NOT throw on transient backend failure
   * (the public endpoint cannot afford to fail because metrics
   * recording broke).
   */
  recordHit(input: {
    apiKeyId: string;
    slug: string;
    statusCode: number;
    latencyMs: number;
    day: string;
  }): Promise<void>;

  /**
   * Read the raw counters for one (key, day). Returns null when
   * no hits were recorded for that day.
   */
  readDay(
    apiKeyId: string,
    day: string,
  ): Promise<MetricsDaySnapshot | null>;

  /**
   * Drop all counters for one (key, day). Called by the consolidate
   * cron after the daily row was UPSERTed successfully.
   */
  clearDay(apiKeyId: string, day: string): Promise<void>;
}

export type MetricsDaySnapshot = {
  counts: number;
  errors: number;
  latencies: number[];
  bySlug: Record<string, number>;
};
