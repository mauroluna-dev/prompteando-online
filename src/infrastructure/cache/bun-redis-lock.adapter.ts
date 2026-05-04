import type { Lock } from "@/application/ports/lock.port";
import { redis } from "./redis";

const RELEASE_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

/**
 * Distributed lock backed by Redis `SET ... NX PX` + Lua CAS release.
 *
 * - `tryAcquire` is non-blocking: returns null immediately if the key
 *   is held. Callers that want to wait must poll.
 * - `release` only deletes the key if its value matches the token
 *   issued by `tryAcquire` — protects against accidentally releasing
 *   a lock whose TTL expired and was re-acquired by another holder.
 */
export class BunRedisLock implements Lock {
  async tryAcquire(key: string, ttlMs: number): Promise<string | null> {
    const token = crypto.randomUUID();
    const result = await redis.send("SET", [
      key,
      token,
      "NX",
      "PX",
      String(ttlMs),
    ]);
    return result === "OK" ? token : null;
  }

  async release(key: string, token: string): Promise<void> {
    await redis.send("EVAL", [RELEASE_LUA, "1", key, token]);
  }
}
