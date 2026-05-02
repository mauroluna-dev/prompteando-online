import type { Cache } from "@/application/ports/cache";
import type { PromptRepository } from "@/application/ports/prompt-repository";
import { publicPromptCacheKey } from "@/application/queries/get-latest-published-version";
import { PromptNotFoundError, type Slug } from "@/domain/prompt";

export type DeletePromptInput = {
  userId: string;
  slug: Slug;
};

export class DeletePromptCommand {
  constructor(
    private readonly repo: PromptRepository,
    private readonly cache: Cache,
  ) {}

  async execute(input: DeletePromptInput): Promise<void> {
    const deleted = await this.repo.delete(input.userId, input.slug);
    if (!deleted) {
      throw new PromptNotFoundError(input.slug);
    }
    await this.cache.del(publicPromptCacheKey(input.userId, input.slug));
  }
}
