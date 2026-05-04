import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const userGithubConnection = pgTable("user_github_connection", {
  userId: text("user_id")
    .primaryKey()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  githubLogin: text("github_login").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  scopes: text("scopes").array().notNull(),
  repoFullName: text("repo_full_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  connectedAt: timestamp("connected_at", { mode: "date" })
    .notNull()
    .defaultNow(),
  backfillStatus: text("backfill_status"),
  backfillTotal: integer("backfill_total"),
  backfillProcessed: integer("backfill_processed"),
  backfillStartedAt: timestamp("backfill_started_at", { mode: "date" }),
  backfillFinishedAt: timestamp("backfill_finished_at", { mode: "date" }),
  backfillFailureReason: text("backfill_failure_reason"),
});
