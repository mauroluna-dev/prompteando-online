CREATE TABLE "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"commit_message" text,
	"github_commit_sha" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_prompt_number_idx" ON "prompt_versions" USING btree ("prompt_id","version_number");--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_current_version_id_prompt_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;