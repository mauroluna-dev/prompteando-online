import { redis } from "bun";

/**
 * Shared Bun.redis client. Connects to `process.env.REDIS_URL`
 * automatically (Bun reads it on first use).
 */
export { redis };
