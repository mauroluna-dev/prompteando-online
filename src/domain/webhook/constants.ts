export const CONSTANTS = {
  EVENTS: ["version.created", "label.assigned"] as const,
  MAX_URL_LENGTH: 2000,
  SECRET_BYTES: 32,
  RETRY_BACKOFFS_MS: [1_000, 3_000, 9_000],
} as const;
