export const CONSTANTS = {
  GITHUB_COMMIT_PATH_PREFIX: "prompts",
  GITHUB_COMMIT_PATH_EXT: ".md",
  GITHUB_LOCK_TTL_MS: 30_000,
  GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS: 30_000,
  GITHUB_LOCK_ACQUIRE_POLL_MS: 500,
  GITHUB_RETRY_BACKOFFS_MS: [1_000, 3_000, 9_000],
  NON_RETRYABLE_ERRORS: [
    "token_invalid",
    "insufficient_scope",
    "repo_missing",
  ],
} as const;
