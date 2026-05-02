import type { PromptRepository } from "@/application/ports/prompt-repository";
import { PromptNotFoundError, type Slug } from "@/domain/prompt";

export type DeletePromptInput = {
  userId: string;
  slug: Slug;
};

export class DeletePromptCommand {
  constructor(private readonly repo: PromptRepository) {}

  async execute(input: DeletePromptInput): Promise<void> {
    const deleted = await this.repo.delete(input.userId, input.slug);
    if (!deleted) {
      throw new PromptNotFoundError(input.slug);
    }
  }
}
