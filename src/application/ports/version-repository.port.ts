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
}
