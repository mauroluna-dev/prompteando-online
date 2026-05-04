import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { apiKeys } from "./api-keys";

export const apiKeyMetricsDaily = pgTable(
  "api_key_metrics_daily",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    totalRequests: integer("total_requests").notNull().default(0),
    totalErrors: integer("total_errors").notNull().default(0),
    p50Ms: integer("p50_ms").notNull().default(0),
    p95Ms: integer("p95_ms").notNull().default(0),
    topPrompts: jsonb("top_prompts")
      .$type<{ slug: string; count: number }[]>()
      .notNull()
      .default([]),
    consolidatedAt: timestamp("consolidated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.apiKeyId, t.day] }),
    index("api_key_metrics_daily_day_idx").on(t.day),
  ],
);
