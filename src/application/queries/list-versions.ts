import type { PromptRepository } from "@/application/ports/prompt-repository";
import type { VersionRepository } from "@/application/ports/version-repository";
import { PromptNotFoundError, parseSlug } from "@/domain/prompt";
import type { PromptVersion } from "@/domain/prompt-version";

export type ListVersionsInput = {
  userId: string;
  slug: string;
};

export class ListVersionsQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
  ) {}

  async execute(input: ListVersionsInput): Promise<PromptVersion[]> {
    const slug = parseSlug(input.slug);
    const prompt = await this.promptRepo.findBySlug(input.userId, slug);
    if (!prompt) throw new PromptNotFoundError(input.slug);
    return this.versionRepo.findAllForPrompt(prompt.id);
  }
}
