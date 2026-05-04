import type {
  MetricsCounter,
  MetricsDaySnapshot,
} from "@/application/ports/metrics-counter.port";
import { CONSTANTS } from "@/domain/api-key";
import { redis } from "./redis";

/**
 * P18 — Redis-backed in-flight counters for API key usage.
 *
 * Key shapes (one set per (key, day) UTC):
 *   metrics:apikey:<id>:counts:<day>    — INCR, integer count
 *   metrics:apikey:<id>:errors:<day>    — INCR, integer count (status >= 400)
 *   metrics:apikey:<id>:lat:<day>       — LIST, latency samples in ms (LPUSH+LTRIM cap)
 *   metrics:apikey:<id>:by-slug:<day>   — HASH, slug → count
 *
 * All keys share the same TTL (METRICS_REDIS_TTL_SECONDS = 8 days).
 * The consolidate cron clears them after persisting the daily row;
 * the TTL is a safety net in case a day is never consolidated.
 */
export class BunRedisMetricsCounter implements MetricsCounter {
  async recordHit(input: {
    apiKeyId: string;
    slug: string;
    statusCode: number;
    latencyMs: number;
    day: string;
  }): Promise<void> {
    const ttl = String(CONSTANTS.METRICS_REDIS_TTL_SECONDS);
    const counts = countsKey(input.apiKeyId, input.day);
    const lat = latKey(input.apiKeyId, input.day);
    const bySlug = bySlugKey(input.apiKeyId, input.day);

    // Pipeline-style: each command awaited individually because
    // Bun.redis doesn't expose a multi/pipeline API yet. Round-trips
    // are local Redis (sub-ms each) so the wall-clock cost is small.
    await redis.send("INCR", [counts]);
    await redis.send("EXPIRE", [counts, ttl]);

    // HASH cap: only HINCRBY if the slug already exists OR the hash
    // is below the cap. This drops "new slugs after cap reached"
    // rather than letting the hash grow unbounded.
    const hashSize = Number(await redis.send("HLEN", [bySlug]));
    const slugAlreadyTracked =
      Number(await redis.send("HEXISTS", [bySlug, input.slug])) === 1;
    if (slugAlreadyTracked || hashSize < CONSTANTS.METRICS_BY_SLUG_CAP) {
      await redis.send("HINCRBY", [bySlug, input.slug, "1"]);
      await redis.send("EXPIRE", [bySlug, ttl]);
    }

    await redis.send("LPUSH", [lat, String(input.latencyMs)]);
    await redis.send("LTRIM", [
      lat,
      "0",
      String(CONSTANTS.METRICS_LATENCY_SAMPLE_CAP - 1),
    ]);
    await redis.send("EXPIRE", [lat, ttl]);

    if (input.statusCode >= 400) {
      const errors = errorsKey(input.apiKeyId, input.day);
      await redis.send("INCR", [errors]);
      await redis.send("EXPIRE", [errors, ttl]);
    }
  }

  async readDay(
    apiKeyId: string,
    day: string,
  ): Promise<MetricsDaySnapshot | null> {
    const countsRaw = await redis.send("GET", [countsKey(apiKeyId, day)]);
    if (countsRaw == null) return null;
    const errorsRaw = await redis.send("GET", [errorsKey(apiKeyId, day)]);
    const latRaw = (await redis.send("LRANGE", [
      latKey(apiKeyId, day),
      "0",
      "-1",
    ])) as string[];
    const slugRaw = (await redis.send("HGETALL", [
      bySlugKey(apiKeyId, day),
    ])) as string[];

    const bySlug: Record<string, number> = {};
    for (let i = 0; i < slugRaw.length; i += 2) {
      const slug = slugRaw[i];
      const count = slugRaw[i + 1];
      if (slug != null && count != null) bySlug[slug] = Number(count);
    }

    return {
      counts: Number(countsRaw),
      errors: errorsRaw == null ? 0 : Number(errorsRaw),
      latencies: latRaw.map((v) => Number(v)).filter((n) => Number.isFinite(n)),
      bySlug,
    };
  }

  async clearDay(apiKeyId: string, day: string): Promise<void> {
    await redis.send("DEL", [
      countsKey(apiKeyId, day),
      errorsKey(apiKeyId, day),
      latKey(apiKeyId, day),
      bySlugKey(apiKeyId, day),
    ]);
  }
}

function countsKey(id: string, day: string): string {
  return `metrics:apikey:${id}:counts:${day}`;
}

function errorsKey(id: string, day: string): string {
  return `metrics:apikey:${id}:errors:${day}`;
}

function latKey(id: string, day: string): string {
  return `metrics:apikey:${id}:lat:${day}`;
}

function bySlugKey(id: string, day: string): string {
  return `metrics:apikey:${id}:by-slug:${day}`;
}
