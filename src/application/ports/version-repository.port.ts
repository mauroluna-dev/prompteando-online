import type { PromptVersion, VersionNumber } from "@/domain/prompt-version";

export interface VersionRepository {
  /**
   * Insert a new version row and update the parent prompt's
   * `current_version_id` atomically.
   */
  appendNewVersion(version: PromptVersion): Promise<void>;

  findByPromptIdAndNumber(
    promptId: string,
    versionNumber: VersionNumber,
  ): Promise<PromptVersion | null>;

  findCurrentForPrompt(promptId: string): Promise<PromptVersion | null>;

  findAllForPrompt(promptId: string): Promise<PromptVersion[]>;

  countForPrompt(promptId: string): Promise<number>;

  findById(versionId: string): Promise<PromptVersion | null>;

  /**
   * Persist a successful GitHub commit: store the sha and clear any
   * prior sync error.
   */
  markGithubCommit(versionId: string, sha: string): Promise<void>;

  /**
   * Persist a GitHub sync failure as a string code. Does not touch
   * `github_commit_sha` (a previous successful sync remains valid).
   */
  markGithubSyncFailed(versionId: string, error: string): Promise<void>;

  /**
   * Returns the oldest version that has not been committed to GitHub
   * for the user, plus the parent prompt's name + slug. "Pending"
   * means `github_commit_sha IS NULL AND github_sync_error IS NULL`
   * — versions that already failed are excluded to avoid loops.
   */
  findOldestPendingForUser(userId: string): Promise<{
    version: PromptVersion;
    promptName: string;
    promptSlug: string;
  } | null>;

  /**
   * Count of versions matching the same "pending" predicate as
   * `findOldestPendingForUser`. Used to set the backfill total.
   */
  countPendingForUser(userId: string): Promise<number>;
}
