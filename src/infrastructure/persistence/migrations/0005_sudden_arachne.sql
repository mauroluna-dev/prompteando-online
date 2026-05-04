CREATE TABLE "user_github_connection" (
	"user_id" text PRIMARY KEY NOT NULL,
	"github_login" text NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"scopes" text[] NOT NULL,
	"repo_full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_github_connection" ADD CONSTRAINT "user_github_connection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;