import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { ApiKeyMetricsRepository } from "@/application/ports/api-key-metrics-repository.port";
import type { MetricsCounter } from "@/application/ports/metrics-counter.port";
import {
  ApiKeyMetricsDaily,
  ApiKeyNotFoundError,
  CONSTANTS,
  type MetricsDailyPoint,
  type MetricsRange,
  type MetricsSummary,
  type TopPromptShare,
} from "@/domain/api-key";

type Clock = { now(): Date };

const defaultClock: Clock = { now: () => new Date() };

/**
 * P18 — Compose the dashboard payload for one API key over a range.
 *
 * Sources:
 * - Postgres `api_key_metrics_daily` for past days (consolidated).
 * - Redis snapshot for "today" (in-flight) — folded into totals
 *   and as the trailing day point so the UI shows live activity.
 *
 * Ownership is enforced via `apiKeyRepo.findById(userId, id)`.
 * Throws ApiKeyNotFoundError when the key doesn't exist OR doesn't
 * belong to the caller — the response is uniform either way to
 * avoid leaking key existence across users.
 */
export class GetApiKeyMetricsQuery {
  constructor(
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly metricsRepo: ApiKeyMetricsRepository,
    private readonly metrics: MetricsCounter,
    private readonly clock: Clock = defaultClock,
  ) {}

  async execute(input: {
    userId: string;
    apiKeyId: string;
    range: MetricsRange;
    includeStatusBreakdown?: boolean;
  }): Promise<MetricsSummary> {
    const apiKey = await this.apiKeyRepo.findById(input.userId, input.apiKeyId);
    if (!apiKey) throw new ApiKeyNotFoundError(input.apiKeyId);

    const today = this.clock.now();
    const todayStr = today.toISOString().slice(0, 10);
    const fromDay = isoDateMinusDays(today, input.range.days - 1);

    const persisted = await this.metricsRepo.findRange(
      input.apiKeyId,
      fromDay,
      todayStr,
    );

    // Fold today's in-flight Redis snapshot into the result so the
    // dashboard shows live activity (otherwise users see "today: 0
    // requests" until the cron runs at 00:05 UTC the next day).
    const live = await this.metrics
      .readDay(input.apiKeyId, todayStr)
      .catch((err) => {
        console.error("[get-api-key-metrics] readDay failed", err);
        return null;
      });

    const dailyByDay = new Map<string, MetricsDailyPoint>();
    for (const row of persisted) {
      dailyByDay.set(row.day, {
        day: row.day,
        requests: row.totalRequests,
        errors: row.totalErrors,
        p50: row.p50Ms,
        p95: row.p95Ms,
      });
    }
    if (live) {
      const { p50, p95 } = ApiKeyMetricsDaily.aggregate(live.latencies);
      dailyByDay.set(todayStr, {
        day: todayStr,
        requests: live.counts,
        errors: live.errors,
        p50,
        p95,
      });
    }
    const daily = [...dailyByDay.values()].sort((a, b) =>
      a.day.localeCompare(b.day),
    );

    const totals = daily.reduce(
      (acc, d) => {
        acc.requests += d.requests;
        acc.errors += d.errors;
        return acc;
      },
      { requests: 0, errors: 0, errorRate: 0 },
    );
    totals.errorRate =
      totals.requests === 0 ? 0 : totals.errors / totals.requests;

    const lastDay = daily[daily.length - 1];
    const latency = lastDay
      ? { p50: lastDay.p50, p95: lastDay.p95 }
      : { p50: 0, p95: 0 };

    const topPrompts = this.aggregateTopPrompts(persisted, live, totals.requests);

    const summary: MetricsSummary = {
      daily,
      totals,
      latency,
      topPrompts,
    };

    if (input.includeStatusBreakdown) {
      // Schema doesn't track per-status counts in V1 (only an
      // aggregate `total_errors`). Return an empty array so the
      // shape is stable; a follow-up phase can populate this.
      summary.statusBreakdown = [];
    }

    return summary;
  }

  private aggregateTopPrompts(
    persisted: ApiKeyMetricsDaily[],
    live: { bySlug: Record<string, number> } | null,
    totalRequests: number,
  ): TopPromptShare[] {
    const byCount = new Map<string, number>();
    for (const row of persisted) {
      for (const entry of row.topPrompts) {
        byCount.set(
          entry.slug,
          (byCount.get(entry.slug) ?? 0) + entry.count,
        );
      }
    }
    if (live) {
      for (const [slug, count] of Object.entries(live.bySlug)) {
        byCount.set(slug, (byCount.get(slug) ?? 0) + count);
      }
    }
    const entries = [...byCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, CONSTANTS.METRICS_TOP_PROMPTS_LIMIT);
    return entries.map(([slug, count]) => ({
      slug,
      count,
      share: totalRequests === 0 ? 0 : count / totalRequests,
    }));
  }
}

function isoDateMinusDays(now: Date, days: number): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
