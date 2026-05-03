import { redis } from "bun";
// Importing env validates REDIS_URL at startup; Bun.redis itself reads
// process.env.REDIS_URL on first use.
import "@/infrastructure/config/env";

export { redis };
