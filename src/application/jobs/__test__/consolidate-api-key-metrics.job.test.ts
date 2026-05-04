import { describe, expect, mock, test } from "bun:test";
import { ConsolidateApiKeyMetricsJob } from "@/application/jobs/consolidate-api-key-metrics.job";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { ApiKeyMetricsRepository } from "@/application/ports/api-key-metrics-repository.port";
import type {
  MetricsCounter,
  MetricsDaySnapshot,
} from "@/application/ports/metrics-counter.port";

const NOW = new Date("2026-05-04T01:00:00Z");
const clock = { now: () => NOW };

function makeApiKeyRepo(ids: string[]): ApiKeyRepository {
  return {
    save: mock(async () => {}),
    findById: mock(async () => null),
    findByPrefix: mock(async () => null),
    findAllByUserId: mock(async () => []),
    setRevokedAt: mock(async () => true),
    countActiveByUserId: mock(async () => 0),
    findAllActiveIds: mock(async () => ids),
  };
}

function makeMetrics(
  data: Record<string, MetricsDaySnapshot | null>,
): MetricsCounter & {
  readDay: ReturnType<typeof mock>;
  clearDay: ReturnType<typeof mock>;
} {
  return {
    recordHit: mock(async () => {}),
    readDay: mock(async (id: string) => data[id] ?? null),
    clearDay: mock(async () => {}),
  } as unknown as MetricsCounter & {
    readDay: ReturnType<typeof mock>;
    clearDay: ReturnType<typeof mock>;
  };
}

function makeMetricsRepo(opts: { failOn?: Set<string> } = {}): ApiKeyMetricsRepository & {
  upsert: ReturnType<typeof mock>;
} {
  return {
    upsert: mock(async (daily) => {
      if (opts.failOn?.has(daily.apiKeyId)) {
        throw new Error(`upsert failed for ${daily.apiKeyId}`);
      }
    }),
    findRange: mock(async () => []),
    deleteOlderThan: mock(async () => 0),
  } as unknown as ApiKeyMetricsRepository & { upsert: ReturnType<typeof mock> };
}

describe("ConsolidateApiKeyMetricsJob", () => {
  test("empty Redis → 0 consolidated, all skipped", async () => {
    const job = new ConsolidateApiKeyMetricsJob(
      makeApiKeyRepo(["k1", "k2"]),
      makeMetrics({ k1: null, k2: null }),
      makeMetricsRepo(),
      clock,
    );
    const result = await job.run();
    expect(result).toEqual({ consolidated: 0, skipped: 2, errors: 0 });
  });

  test("3 keys with data → 3 upserts + 3 clearDay calls", async () => {
    const data: Record<string, MetricsDaySnapshot> = {
      k1: { counts: 10, errors: 1, latencies: [50, 100], bySlug: { a: 10 } },
      k2: { counts: 5, errors: 0, latencies: [30], bySlug: { b: 5 } },
      k3: { counts: 1, errors: 0, latencies: [200], bySlug: { c: 1 } },
    };
    const repo = makeMetricsRepo();
    const metrics = makeMetrics(data);
    const job = new ConsolidateApiKeyMetricsJob(
      makeApiKeyRepo(["k1", "k2", "k3"]),
      metrics,
      repo,
      clock,
    );
    const result = await job.run();
    expect(result).toEqual({ consolidated: 3, skipped: 0, errors: 0 });
    expect(repo.upsert).toHaveBeenCalledTimes(3);
    expect(metrics.clearDay).toHaveBeenCalledTimes(3);
  });

  test("default day = yesterday UTC", async () => {
    const metrics = makeMetrics({ k1: null });
    const job = new ConsolidateApiKeyMetricsJob(
      makeApiKeyRepo(["k1"]),
      metrics,
      makeMetricsRepo(),
      clock, // NOW = 2026-05-04
    );
    await job.run();
    expect(metrics.readDay).toHaveBeenCalledWith("k1", "2026-05-03");
  });

  test("explicit --day argument overrides default", async () => {
    const metrics = makeMetrics({ k1: null });
    const job = new ConsolidateApiKeyMetricsJob(
      makeApiKeyRepo(["k1"]),
      metrics,
      makeMetricsRepo(),
      clock,
    );
    await job.run({ day: "2026-04-15" });
    expect(metrics.readDay).toHaveBeenCalledWith("k1", "2026-04-15");
  });

  test("upsert failure for one key doesn't abort the run, doesn't clear that key", async () => {
    const data: Record<string, MetricsDaySnapshot> = {
      k1: { counts: 10, errors: 0, latencies: [50], bySlug: { a: 10 } },
      k2: { counts: 5, errors: 0, latencies: [30], bySlug: { b: 5 } },
      k3: { counts: 1, errors: 0, latencies: [200], bySlug: { c: 1 } },
    };
    const repo = makeMetricsRepo({ failOn: new Set(["k2"]) });
    const metrics = makeMetrics(data);
    const job = new ConsolidateApiKeyMetricsJob(
      makeApiKeyRepo(["k1", "k2", "k3"]),
      metrics,
      repo,
      clock,
    );
    const result = await job.run();
    expect(result).toEqual({ consolidated: 2, skipped: 0, errors: 1 });
    expect(repo.upsert).toHaveBeenCalledTimes(3);
    // clearDay only for the 2 that succeeded (k2's data survives
    // for retry).
    expect(metrics.clearDay).toHaveBeenCalledTimes(2);
    const cleared = metrics.clearDay.mock.calls.map((c) => c[0]);
    expect(cleared).not.toContain("k2");
  });

  test("topPrompts capped at METRICS_TOP_PROMPTS_LIMIT (10) and sorted desc", async () => {
    const bySlug: Record<string, number> = {};
    for (let i = 0; i < 25; i++) bySlug[`slug-${i}`] = i + 1;
    const data: Record<string, MetricsDaySnapshot> = {
      k1: {
        counts: 100,
        errors: 0,
        latencies: [1, 2, 3],
        bySlug,
      },
    };
    const repo = makeMetricsRepo();
    const job = new ConsolidateApiKeyMetricsJob(
      makeApiKeyRepo(["k1"]),
      makeMetrics(data),
      repo,
      clock,
    );
    await job.run();
    const upserted = repo.upsert.mock.calls[0]?.[0];
    expect(upserted?.topPrompts.length).toBe(10);
    // highest count first
    expect(upserted?.topPrompts[0]?.count).toBe(25);
    expect(upserted?.topPrompts[9]?.count).toBe(16);
  });
});
