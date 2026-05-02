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
}
