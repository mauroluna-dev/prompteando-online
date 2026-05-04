import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
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

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
