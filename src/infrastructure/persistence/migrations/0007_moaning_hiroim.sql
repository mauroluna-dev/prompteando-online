ALTER TABLE "user_github_connection" ADD COLUMN "backfill_status" text;--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD COLUMN "backfill_total" integer;--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD COLUMN "backfill_processed" integer;--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD COLUMN "backfill_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD COLUMN "backfill_finished_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD COLUMN "backfill_failure_reason" text;