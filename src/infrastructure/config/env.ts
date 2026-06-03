import { z } from "zod";

const schema = z.object({
  // Postgres connection is built from individual parts — there is no
  // DATABASE_URL. Single source of truth shared with the postgres
  // container (docker compose), so no double-declaration.
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  REDIS_URL: z.url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  AUTH_URL: z.url(),
  // Auth.js login OAuth App (callback: /auth/callback/github).
  GITHUB_AUTH_CLIENT_ID: z.string().min(1),
  GITHUB_AUTH_CLIENT_SECRET: z.string().min(1),
  // Separate OAuth App for the Settings → Connect GitHub flow
  // (callback: /api/integrations/github/oauth-callback). GitHub
  // OAuth Apps only allow one callback URL each, so we register
  // two apps to support both flows simultaneously.
  GITHUB_INTEGRATIONS_CLIENT_ID: z.string().min(1),
  GITHUB_INTEGRATIONS_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .min(40, "ENCRYPTION_KEY must be base64 of 32 bytes (~44 chars)"),
  SENTRY_DSN: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

/** Postgres connection URL assembled from the POSTGRES_* parts. */
function buildPostgresUrl(e: z.infer<typeof schema>): string {
  const user = encodeURIComponent(e.POSTGRES_USER);
  const pass = encodeURIComponent(e.POSTGRES_PASSWORD);
  return `postgres://${user}:${pass}@${e.POSTGRES_HOST}:${e.POSTGRES_PORT}/${e.POSTGRES_DB}`;
}

export type Env = z.infer<typeof schema> & { databaseUrl: string };

const parsed = schema.parse(process.env);
export const env: Env = { ...parsed, databaseUrl: buildPostgresUrl(parsed) };
