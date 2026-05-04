export type TopPromptEntry = { slug: string; count: number };

export type ApiKeyMetricsDailyRow = {
  apiKeyId: string;
  day: string; // "YYYY-MM-DD"
  totalRequests: number;
  totalErrors: number;
  p50Ms: number;
  p95Ms: number;
  topPrompts: TopPromptEntry[];
  consolidatedAt: Date;
};


/**
 * P18 — One row per (api_key, UTC day). Persisted snapshot
 * computed by ConsolidateApiKeyMetricsJob from the in-flight Redis
 * counters of the previous day.
 */
export class ApiKeyMetricsDaily {
  private constructor(
    readonly apiKeyId: string,
    readonly day: string,
    readonly totalRequests: number,
    readonly totalErrors: number,
    readonly p50Ms: number,
    readonly p95Ms: number,
    readonly topPrompts: readonly TopPromptEntry[],
    readonly consolidatedAt: Date,
  ) {}

  static create(input: {
    apiKeyId: string;
    day: string;
    totalRequests: number;
    totalErrors: number;
    p50Ms: number;
    p95Ms: number;
    topPrompts: readonly TopPromptEntry[];
    now: Date;
  }): ApiKeyMetricsDaily {
    return new ApiKeyMetricsDaily(
      input.apiKeyId,
      input.day,
      input.totalRequests,
      input.totalErrors,
      input.p50Ms,
      input.p95Ms,
      input.topPrompts,
      input.now,
    );
  }

  static fromRow(row: ApiKeyMetricsDailyRow): ApiKeyMetricsDaily {
    // drizzle's date column comes back as a string ("YYYY-MM-DD"),
    // but we accept Date for safety in case downstream code coerces.
    const day =
      typeof row.day === "string"
        ? row.day
        : new Date(row.day).toISOString().slice(0, 10);
    return new ApiKeyMetricsDaily(
      row.apiKeyId,
      day,
      row.totalRequests,
      row.totalErrors,
      row.p50Ms,
      row.p95Ms,
      row.topPrompts ?? [],
      row.consolidatedAt,
    );
  }

  toJSON(): ApiKeyMetricsDailyRow {
    return {
      apiKeyId: this.apiKeyId,
      day: this.day,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      p50Ms: this.p50Ms,
      p95Ms: this.p95Ms,
      topPrompts: [...this.topPrompts],
      consolidatedAt: this.consolidatedAt,
    };
  }

  /**
   * Compute p50/p95 from a samples array (latencies in ms). Sort
   * ascending and pick the percentile index. Returns 0/0 for an
   * empty input. Caller is responsible for capping the array
   * (see CONSTANTS.METRICS_LATENCY_SAMPLE_CAP).
   */
  static aggregate(samples: readonly number[]): {
    p50: number;
    p95: number;
  } {
    if (samples.length === 0) return { p50: 0, p95: 0 };
    const sorted = [...samples].sort((a, b) => a - b);
    const pickIndex = (p: number) => {
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return Math.max(0, Math.min(sorted.length - 1, idx));
    };
    return {
      p50: Math.round(sorted[pickIndex(50)] ?? 0),
      p95: Math.round(sorted[pickIndex(95)] ?? 0),
    };
  }
}
