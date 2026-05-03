import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { PromptNotFoundError, Slug } from "@/domain/prompt";
import type { PromptVersion } from "@/domain/prompt-version";

export class ListVersionsQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
  ) {}

  async execute(userId: string, rawSlug: string): Promise<PromptVersion[]> {
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);
    return this.versionRepo.findAllForPrompt(prompt.id);
  }
}
