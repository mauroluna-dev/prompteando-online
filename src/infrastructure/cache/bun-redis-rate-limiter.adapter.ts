import type {
  RateLimitResult,
  RateLimiter,
} from "@/application/ports/rate-limiter.port";
import { redis } from "./redis";

/**
 * Fixed-window rate limiter using Redis INCR + EXPIRE.
 * Two commands per request, no sorted sets required. Less precise
 * than a sliding window at boundaries (worst case: 2x the limit
 * within a window if traffic clumps near the boundary), but
 * sufficient for the V1 default of 100 req/min per key.
 */
export class BunRedisRateLimiter implements RateLimiter {
  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs);
    const wkey = `rl:${key}:${windowStart}`;

    const count = await redis.incr(wkey);
    if (count === 1) {
      await redis.expire(wkey, windowSeconds);
    }

    const resetAt = (windowStart + 1) * windowMs;
    if (count > limit) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return { allowed: false, retryAfter };
    }
    return { allowed: true, remaining: limit - count, resetAt };
  }
}
