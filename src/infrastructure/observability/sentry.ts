import * as Sentry from "@sentry/bun";
import { env } from "@/infrastructure/config/env";

let initialized = false;

/**
 * Opt-in error tracking. No-ops unless `SENTRY_DSN` is set, so dev,
 * test and CI (where the DSN is unset) pay nothing. Works against any
 * Sentry-compatible endpoint (e.g. a self-hosted Bugsink instance).
 *
 * Idempotent: safe to call more than once.
 */
export function initSentry(): void {
  if (initialized || !env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Error tracking only — no performance tracing in V1.
    tracesSampleRate: 0,
  });
  initialized = true;
}

/** Reports an exception when Sentry is active; otherwise a no-op. */
export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}
