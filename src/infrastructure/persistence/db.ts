import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = new SQL(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export type DB = typeof db;
