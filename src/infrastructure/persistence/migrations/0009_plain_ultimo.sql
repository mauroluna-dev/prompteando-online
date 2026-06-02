ALTER TABLE "prompts" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "template_var_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD COLUMN "template_vars" jsonb DEFAULT '[]'::jsonb NOT NULL;