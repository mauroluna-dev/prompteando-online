import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { SQL } from "bun";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = new SQL(process.env.DATABASE_URL);
const db = drizzle(sql);

console.log("Running migrations...");
await migrate(db, {
  migrationsFolder: "src/infrastructure/persistence/migrations",
});
console.log("Migrations applied.");
await sql.end();
