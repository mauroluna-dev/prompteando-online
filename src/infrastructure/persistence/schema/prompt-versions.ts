import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { prompts } from "./prompts";

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    promptId: text("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    commitMessage: text("commit_message"),
    githubCommitSha: text("github_commit_sha"),
    githubSyncError: text("github_sync_error"),
    // P19 — immutable snapshot of the `{{var}}` names present in this
    // version's content, computed at save time.
    templateVars: jsonb("template_vars")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("prompt_versions_prompt_number_idx").on(
      t.promptId,
      t.versionNumber,
    ),
  ],
);
