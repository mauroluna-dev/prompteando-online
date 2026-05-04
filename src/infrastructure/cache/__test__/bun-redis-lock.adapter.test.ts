import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BunRedisLock } from "../bun-redis-lock.adapter";
import { redis } from "../redis";

const skip = !process.env.REDIS_URL;
const d = skip ? describe.skip : describe;

const KEY_PREFIX = `__test:lock:${crypto.randomUUID()}:`;

async function flushTestKeys(): Promise<void> {
  const keys = (await redis.send("KEYS", [`${KEY_PREFIX}*`])) as string[] | null;
  if (keys && keys.length > 0) {
    await redis.send("DEL", keys);
  }
}

d("BunRedisLock", () => {
  beforeAll(() => {
    // Force connection so subsequent commands don't race the handshake.
    return redis.send("PING", []);
  });

  afterEach(flushTestKeys);

  test("tryAcquire returns a token, second tryAcquire returns null", async () => {
    const lock = new BunRedisLock();
    const k = `${KEY_PREFIX}a`;
    const t1 = await lock.tryAcquire(k, 5000);
    expect(t1).not.toBeNull();
    const t2 = await lock.tryAcquire(k, 5000);
    expect(t2).toBeNull();
  });

  test("release with matching token frees the lock", async () => {
    const lock = new BunRedisLock();
    const k = `${KEY_PREFIX}b`;
    const t1 = await lock.tryAcquire(k, 5000);
    expect(t1).not.toBeNull();
    if (t1 === null) throw new Error("expected token");
    await lock.release(k, t1);
    const t2 = await lock.tryAcquire(k, 5000);
    expect(t2).not.toBeNull();
  });

  test("release with wrong token is a no-op", async () => {
    const lock = new BunRedisLock();
    const k = `${KEY_PREFIX}c`;
    const t1 = await lock.tryAcquire(k, 5000);
    expect(t1).not.toBeNull();
    await lock.release(k, "not-the-token");
    const t2 = await lock.tryAcquire(k, 5000);
    expect(t2).toBeNull();
  });

  test("TTL: lock auto-expires", async () => {
    const lock = new BunRedisLock();
    const k = `${KEY_PREFIX}d`;
    const t1 = await lock.tryAcquire(k, 200);
    expect(t1).not.toBeNull();
    await new Promise((r) => setTimeout(r, 350));
    const t2 = await lock.tryAcquire(k, 5000);
    expect(t2).not.toBeNull();
  });
});
