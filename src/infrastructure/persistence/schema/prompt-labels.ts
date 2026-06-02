import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { promptVersions } from "./prompt-versions";
import { prompts } from "./prompts";

// P20 — deploy labels / aliases. Each (prompt, label) points at one
// version. `latest` is virtual (not stored). Deploy = move the label.
export const promptLabels = pgTable(
  "prompt_labels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    promptId: text("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    versionId: text("version_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("prompt_labels_prompt_label_idx").on(t.promptId, t.label)],
);
