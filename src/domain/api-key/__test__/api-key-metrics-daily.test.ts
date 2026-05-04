import { describe, expect, test } from "bun:test";
import { ApiKeyMetricsDaily } from "@/domain/api-key";

describe("ApiKeyMetricsDaily.aggregate", () => {
  test("empty samples → 0/0", () => {
    expect(ApiKeyMetricsDaily.aggregate([])).toEqual({ p50: 0, p95: 0 });
  });

  test("single sample → both percentiles equal it", () => {
    expect(ApiKeyMetricsDaily.aggregate([42])).toEqual({ p50: 42, p95: 42 });
  });

  test("range 1..100 → p50≈50, p95≈95", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const { p50, p95 } = ApiKeyMetricsDaily.aggregate(samples);
    expect(p50).toBe(50);
    expect(p95).toBe(95);
  });

  test("rounds to integers", () => {
    expect(ApiKeyMetricsDaily.aggregate([1.4, 2.6, 3.5])).toEqual({
      p50: 3,
      p95: 4,
    });
  });

  test("does not mutate the input array", () => {
    const samples = [9, 1, 5, 3, 7];
    const before = [...samples];
    ApiKeyMetricsDaily.aggregate(samples);
    expect(samples).toEqual(before);
  });
});

describe("ApiKeyMetricsDaily.fromRow / toJSON", () => {
  test("roundtrips a row", () => {
    const now = new Date("2026-05-04T00:05:00Z");
    const entity = ApiKeyMetricsDaily.fromRow({
      apiKeyId: "k1",
      day: "2026-05-03",
      totalRequests: 42,
      totalErrors: 3,
      p50Ms: 87,
      p95Ms: 210,
      topPrompts: [{ slug: "a", count: 30 }, { slug: "b", count: 12 }],
      consolidatedAt: now,
    });
    expect(entity.toJSON()).toEqual({
      apiKeyId: "k1",
      day: "2026-05-03",
      totalRequests: 42,
      totalErrors: 3,
      p50Ms: 87,
      p95Ms: 210,
      topPrompts: [{ slug: "a", count: 30 }, { slug: "b", count: 12 }],
      consolidatedAt: now,
    });
  });

  test("normalizes Date day → YYYY-MM-DD string", () => {
    const entity = ApiKeyMetricsDaily.fromRow({
      apiKeyId: "k1",
      day: new Date("2026-05-03T12:00:00Z") as unknown as string,
      totalRequests: 0,
      totalErrors: 0,
      p50Ms: 0,
      p95Ms: 0,
      topPrompts: [],
      consolidatedAt: new Date(),
    });
    expect(entity.day).toBe("2026-05-03");
  });
});
