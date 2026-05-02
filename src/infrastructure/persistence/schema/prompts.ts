import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const prompts = pgTable(
  "prompts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    currentVersionId: text("current_version_id"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("prompts_user_slug_idx").on(t.userId, t.slug)],
);
