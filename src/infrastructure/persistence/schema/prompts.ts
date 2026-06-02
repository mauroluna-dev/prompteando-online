import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { TemplateVarMeta } from "@/domain/prompt";
import { users } from "./auth";
import { promptVersions } from "./prompt-versions";

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
    currentVersionId: text("current_version_id").references(
      (): AnyPgColumn => promptVersions.id,
      { onDelete: "set null" },
    ),
    // P19 — template variables. Opt-in flag + prompt-level (mutable,
    // non-versioned) per-variable metadata (description, default).
    isTemplate: boolean("is_template").notNull().default(false),
    templateVarMeta: jsonb("template_var_meta")
      .$type<TemplateVarMeta>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("prompts_user_slug_idx").on(t.userId, t.slug)],
);
