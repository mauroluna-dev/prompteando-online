import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/persistence/schema/index.ts",
  out: "./src/infrastructure/persistence/migrations",
  dbCredentials: {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "prompteando",
    password: process.env.POSTGRES_PASSWORD ?? "prompteando",
    database: process.env.POSTGRES_DB ?? "prompteando",
    ssl: false,
  },
});
