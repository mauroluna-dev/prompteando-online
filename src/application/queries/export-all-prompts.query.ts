import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import type { Prompt } from "@/domain/prompt";
import type { ExportBundle, ExportPrompt } from "./export-bundle.dto";

/**
 * Loads every prompt + all its versions for a user into an in-memory
 * {@link ExportBundle}, ready to be streamed as a ZIP. Read-only.
 *
 * Ordering is forced explicitly (prompts by `createdAt ASC`, id as
 * tie-break; versions by `versionNumber ASC`) so two back-to-back
 * exports of unchanged data produce byte-identical archives —
 * regardless of the order Postgres happens to return rows in.
 */
export class ExportAllPromptsQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
  ) {}

  async execute(userId: string): Promise<ExportBundle> {
    const prompts = await this.promptRepo.findAllByUserId(userId);
    const ordered = [...prompts].sort(comparePrompts);

    const exported = await Promise.all(
      ordered.map((prompt) => this.exportPrompt(prompt)),
    );

    return {
      generatedAt: new Date(),
      user: { id: userId },
      prompts: exported,
    };
  }

  private async exportPrompt(prompt: Prompt): Promise<ExportPrompt> {
    const versions = await this.versionRepo.findAllForPrompt(prompt.id);
    const ordered = [...versions].sort(
      (a, b) => a.versionNumber.value - b.versionNumber.value,
    );
    const currentVersionNumber =
      ordered.find((v) => v.id === prompt.currentVersionId)?.versionNumber
        .value ?? null;

    return {
      id: prompt.id,
      slug: prompt.slug.value,
      name: prompt.name.value,
      description: prompt.description,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
      currentVersionNumber,
      versions: ordered.map((v) => ({
        versionNumber: v.versionNumber.value,
        content: v.content,
        commitMessage: v.commitMessage,
        createdAt: v.createdAt,
        githubCommitSha: v.githubCommitSha,
      })),
    };
  }
}

function comparePrompts(a: Prompt, b: Prompt): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
