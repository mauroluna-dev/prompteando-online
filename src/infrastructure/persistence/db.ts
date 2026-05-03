import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import { env } from "@/infrastructure/config/env";
import * as schema from "./schema";

const sql = new SQL(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export type DB = typeof db;
