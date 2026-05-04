import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { ApiKeyMetricsRepository } from "@/application/ports/api-key-metrics-repository.port";
import type { MetricsCounter } from "@/application/ports/metrics-counter.port";
import {
  ApiKeyMetricsDaily,
  CONSTANTS,
  type TopPromptEntry,
} from "@/domain/api-key";

type Clock = { now(): Date };

const defaultClock: Clock = { now: () => new Date() };

/**
 * P18 — Daily cron that drains the previous day's Redis counters
 * into a persisted snapshot in `api_key_metrics_daily`.
 *
 * Idempotent: if a row for (key, day) already exists the UPSERT
 * overwrites it. Re-runs are safe; if Redis was already cleared
 * for that day, readDay returns null and the key is skipped.
 *
 * Per-key errors are logged and counted but never abort the run —
 * one bad key shouldn't lose metrics for all the others.
 */
export class ConsolidateApiKeyMetricsJob {
  constructor(
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly metrics: MetricsCounter,
    private readonly metricsRepo: ApiKeyMetricsRepository,
    private readonly clock: Clock = defaultClock,
  ) {}

  async run(input: { day?: string } = {}): Promise<{
    consolidated: number;
    skipped: number;
    errors: number;
  }> {
    const day = input.day ?? yesterdayUtc(this.clock.now());
    const ids = await this.apiKeyRepo.findAllActiveIds();

    let consolidated = 0;
    let skipped = 0;
    let errors = 0;

    for (const id of ids) {
      try {
        const snap = await this.metrics.readDay(id, day);
        if (!snap) {
          skipped++;
          continue;
        }

        const { p50, p95 } = ApiKeyMetricsDaily.aggregate(snap.latencies);
        const topPrompts = this.computeTopPrompts(snap.bySlug);

        const daily = ApiKeyMetricsDaily.create({
          apiKeyId: id,
          day,
          totalRequests: snap.counts,
          totalErrors: snap.errors,
          p50Ms: p50,
          p95Ms: p95,
          topPrompts,
          now: this.clock.now(),
        });

        await this.metricsRepo.upsert(daily);
        // Only clear Redis after the upsert succeeded — if upsert
        // throws, the day's data survives in Redis (TTL 8d) for a
        // retry on the next cron tick or a manual --day=YYYY-MM-DD.
        await this.metrics.clearDay(id, day);
        consolidated++;
      } catch (err) {
        errors++;
        console.error(
          `[consolidate-api-key-metrics] key=${id} day=${day}`,
          err,
        );
      }
    }

    return { consolidated, skipped, errors };
  }

  private computeTopPrompts(bySlug: Record<string, number>): TopPromptEntry[] {
    return Object.entries(bySlug)
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONSTANTS.METRICS_TOP_PROMPTS_LIMIT);
  }
}

function yesterdayUtc(now: Date): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
