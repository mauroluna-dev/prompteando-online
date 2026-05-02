import type { VersionNumber } from "./version-number";

export type PromptVersion = {
  id: string;
  promptId: string;
  versionNumber: VersionNumber;
  content: string;
  commitMessage: string | null;
  githubCommitSha: string | null;
  createdAt: Date;
};
