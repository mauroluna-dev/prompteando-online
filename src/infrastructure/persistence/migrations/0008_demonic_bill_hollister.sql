CREATE TABLE "api_key_metrics_daily" (
	"api_key_id" text NOT NULL,
	"day" date NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_errors" integer DEFAULT 0 NOT NULL,
	"p50_ms" integer DEFAULT 0 NOT NULL,
	"p95_ms" integer DEFAULT 0 NOT NULL,
	"top_prompts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consolidated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_metrics_daily_api_key_id_day_pk" PRIMARY KEY("api_key_id","day")
);
--> statement-breakpoint
ALTER TABLE "api_key_metrics_daily" ADD CONSTRAINT "api_key_metrics_daily_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_metrics_daily_day_idx" ON "api_key_metrics_daily" USING btree ("day");