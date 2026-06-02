import { describe, expect, mock, test } from "bun:test";
import { GetApiKeyMetricsQuery } from "@/application/queries/get-api-key-metrics.query";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { ApiKeyMetricsRepository } from "@/application/ports/api-key-metrics-repository.port";
import type { MetricsCounter } from "@/application/ports/metrics-counter.port";
import {
  ApiKey,
  ApiKeyMetricsDaily,
  ApiKeyName,
  ApiKeyNotFoundError,
  MetricsRange,
} from "@/domain/api-key";

const NOW = new Date("2026-05-04T12:00:00Z");

function makeOwnedKey(): ApiKey {
  return ApiKey.create(
    "k1",
    "u1",
    ApiKeyName.parse("Production"),
    "po_live_abcd1234",
    "hash",
    new Date("2026-04-01T00:00:00Z"),
  );
}

function makeApiKeyRepo(opts: { found: boolean }): ApiKeyRepository {
  return {
    save: mock(async () => {}),
    findById: mock(async () => (opts.found ? makeOwnedKey() : null)),
    findByPrefix: mock(async () => null),
    findAllByUserId: mock(async () => []),
    setRevokedAt: mock(async () => true),
    countActiveByUserId: mock(async () => 0),
    findAllActiveIds: mock(async () => []),
  };
}

function makeMetricsRepo(
  rows: ApiKeyMetricsDaily[],
): ApiKeyMetricsRepository {
  return {
    upsert: mock(async () => {}),
    findRange: mock(async () => rows),
    deleteOlderThan: mock(async () => 0),
  };
}

function makeMetrics(
  liveDay: { counts: number; errors: number; latencies: number[]; bySlug: Record<string, number> } | null,
): MetricsCounter {
  return {
    recordHit: mock(async () => {}),
    readDay: mock(async () => liveDay),
    clearDay: mock(async () => {}),
  };
}

const clock = { now: () => NOW };

describe("GetApiKeyMetricsQuery", () => {
  test("throws ApiKeyNotFoundError when key isn't owned by user", async () => {
    const query = new GetApiKeyMetricsQuery(
      makeApiKeyRepo({ found: false }),
      makeMetricsRepo([]),
      makeMetrics(null),
      clock,
    );
    await expect(
      query.execute({
        userId: "u1",
        apiKeyId: "k1",
        range: MetricsRange.parse("7d"),
      }),
    ).rejects.toBeInstanceOf(ApiKeyNotFoundError);
  });

  test("empty range → all zero, no top prompts", async () => {
    const query = new GetApiKeyMetricsQuery(
      makeApiKeyRepo({ found: true }),
      makeMetricsRepo([]),
      makeMetrics(null),
      clock,
    );
    const result = await query.execute({
      userId: "u1",
      apiKeyId: "k1",
      range: MetricsRange.parse("7d"),
    });
    expect(result.daily).toEqual([]);
    expect(result.totals).toEqual({ requests: 0, errors: 0, errorRate: 0 });
    expect(result.latency).toEqual({ p50: 0, p95: 0 });
    expect(result.topPrompts).toEqual([]);
  });

  test("aggregates persisted days + live today", async () => {
    const persisted = [
      ApiKeyMetricsDaily.fromRow({
        apiKeyId: "k1",
        day: "2026-05-02",
        totalRequests: 100,
        totalErrors: 5,
        p50Ms: 50,
        p95Ms: 120,
        topPrompts: [
          { slug: "alpha", count: 60 },
          { slug: "beta", count: 40 },
        ],
        consolidatedAt: NOW,
      }),
      ApiKeyMetricsDaily.fromRow({
        apiKeyId: "k1",
        day: "2026-05-03",
        totalRequests: 200,
        totalErrors: 8,
        p50Ms: 60,
        p95Ms: 150,
        topPrompts: [
          { slug: "alpha", count: 150 },
          { slug: "gamma", count: 50 },
        ],
        consolidatedAt: NOW,
      }),
    ];
    const live = {
      counts: 50,
      errors: 2,
      latencies: [10, 20, 30, 40, 50],
      bySlug: { alpha: 30, beta: 20 },
    };
    const query = new GetApiKeyMetricsQuery(
      makeApiKeyRepo({ found: true }),
      makeMetricsRepo(persisted),
      makeMetrics(live),
      clock,
    );
    const result = await query.execute({
      userId: "u1",
      apiKeyId: "k1",
      range: MetricsRange.parse("7d"),
    });

    expect(result.daily.length).toBe(3); // May 2 + May 3 + today
    expect(result.daily[result.daily.length - 1]?.day).toBe("2026-05-04");
    expect(result.totals).toEqual({
      requests: 350,
      errors: 15,
      errorRate: 15 / 350,
    });
    // latency = today's snapshot via aggregate([10..50])
    expect(result.latency.p50).toBeGreaterThan(0);
    // topPrompts: alpha = 60+150+30 = 240, beta = 40+20 = 60, gamma = 50
    expect(result.topPrompts[0]).toEqual({
      slug: "alpha",
      count: 240,
      share: 240 / 350,
    });
    expect(result.topPrompts.find((p) => p.slug === "beta")?.count).toBe(60);
    expect(result.topPrompts.find((p) => p.slug === "gamma")?.count).toBe(50);
  });

  test("includes statusBreakdown empty when flag is on (V1 placeholder)", async () => {
    const query = new GetApiKeyMetricsQuery(
      makeApiKeyRepo({ found: true }),
      makeMetricsRepo([]),
      makeMetrics(null),
      clock,
    );
    const result = await query.execute({
      userId: "u1",
      apiKeyId: "k1",
      range: MetricsRange.parse("7d"),
      includeStatusBreakdown: true,
    });
    expect(result.statusBreakdown).toEqual([]);
  });
});
