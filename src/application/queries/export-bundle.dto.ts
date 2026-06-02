/**
 * Read-optimized DTO produced by {@link ExportAllPromptsQuery} and
 * consumed by the ZIP writer. Plain data only — no domain objects —
 * so the infrastructure layer can serialize it without reaching into
 * entities/VOs. Dates serialize to ISO strings via `JSON.stringify`.
 */
export type ExportBundle = {
  generatedAt: Date;
  user: { id: string };
  prompts: ExportPrompt[];
};

export type ExportPrompt = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentVersionNumber: number | null;
  versions: ExportVersion[];
};

export type ExportVersion = {
  versionNumber: number;
  content: string;
  commitMessage: string | null;
  createdAt: Date;
  githubCommitSha: string | null;
};
