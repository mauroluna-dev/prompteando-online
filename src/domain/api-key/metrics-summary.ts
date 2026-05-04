/**
 * P18 — Read DTO returned by GetApiKeyMetricsQuery and consumed by
 * the frontend dashboard. Aggregated across the requested range
 * (7d / 30d / 90d).
 */
export type MetricsDailyPoint = {
  day: string; // "YYYY-MM-DD" UTC
  requests: number;
  errors: number;
  p50: number;
  p95: number;
};

export type TopPromptShare = {
  slug: string;
  count: number;
  share: number; // 0..1
};

export type StatusBreakdownEntry = {
  statusCode: number;
  count: number;
};

export type MetricsSummary = {
  daily: MetricsDailyPoint[];
  totals: {
    requests: number;
    errors: number;
    errorRate: number; // 0..1
  };
  latency: {
    p50: number;
    p95: number;
  };
  topPrompts: TopPromptShare[];
  /**
   * Only populated when the deep-dive page requests
   * `?include=status-breakdown`.
   *
   * Note: in V1 we don't store per-status counts (only an aggregate
   * `total_errors`), so this stays empty until a follow-up phase
   * adds that dimension. Kept on the type so the API shape doesn't
   * break when the column lands.
   */
  statusBreakdown?: StatusBreakdownEntry[];
};
