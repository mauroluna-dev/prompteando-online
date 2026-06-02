import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PromptType } from "@/domain/prompt";
import type { PromptConfig } from "@/domain/prompt-version";
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
    // P21 — "text" (content is the prompt) or "chat" (content is a
    // JSON-serialized message array).
    type: text("type").$type<PromptType>().notNull().default("text"),
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
    // P22 — free-form model params (model, temperature, etc.) versioned
    // together with the prompt.
    config: jsonb("config").$type<PromptConfig>().notNull().default({}),
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
