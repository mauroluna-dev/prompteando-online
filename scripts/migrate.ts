import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { SQL } from "bun";
import { env } from "@/infrastructure/config/env";

const sql = new SQL(env.DATABASE_URL);
const db = drizzle(sql);

console.log("Running migrations...");
await migrate(db, {
  migrationsFolder: "src/infrastructure/persistence/migrations",
});
console.log("Migrations applied.");
await sql.end();
