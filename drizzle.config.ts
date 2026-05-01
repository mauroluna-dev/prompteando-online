import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/persistence/schema/index.ts",
  out: "./src/infrastructure/persistence/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
