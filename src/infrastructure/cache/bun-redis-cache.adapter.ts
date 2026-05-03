import type { Cache } from "@/application/ports/cache.port";
import { redis } from "./redis";

export class BunRedisCache implements Cache {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt cache entry — drop it and miss.
      await redis.del(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value));
    await redis.expire(key, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await redis.del(key);
  }
}
