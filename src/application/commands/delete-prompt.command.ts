import type { Cache } from "@/application/ports/cache.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import { publicPromptCacheKey } from "@/application/queries/get-latest-published-version.query";
import { PromptNotFoundError, type Slug } from "@/domain/prompt";

export class DeletePromptCommand {
  constructor(
    private readonly repo: PromptRepository,
    private readonly cache: Cache,
  ) {}

  async execute(userId: string, slug: Slug): Promise<void> {
    const deleted = await this.repo.delete(userId, slug);
    if (!deleted) throw new PromptNotFoundError(slug.value);
    await this.cache.del(publicPromptCacheKey(userId, slug.value));
  }
}
