CREATE TABLE "prompt_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" text NOT NULL,
	"label" text NOT NULL,
	"version_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_labels" ADD CONSTRAINT "prompt_labels_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_labels" ADD CONSTRAINT "prompt_labels_version_id_prompt_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_labels_prompt_label_idx" ON "prompt_labels" USING btree ("prompt_id","label");