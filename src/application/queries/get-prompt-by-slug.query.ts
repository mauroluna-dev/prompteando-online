import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import { PromptNotFoundError, type Prompt, type Slug } from "@/domain/prompt";

export class GetPromptBySlugQuery {
  constructor(private readonly repo: PromptRepository) {}

  async execute(userId: string, slug: Slug): Promise<Prompt> {
    const prompt = await this.repo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(slug.value);
    return prompt;
  }
}
