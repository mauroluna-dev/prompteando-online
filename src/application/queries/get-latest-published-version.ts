import type { Cache } from "@/application/ports/cache";
import type { PromptRepository } from "@/application/ports/prompt-repository";
import type { VersionRepository } from "@/application/ports/version-repository";
import { parseSlug } from "@/domain/prompt";
import type { PublicPromptDTO } from "@/domain/prompt-version";

const CACHE_TTL_SECONDS = 300;

export function publicPromptCacheKey(userId: string, slug: string): string {
  return `prompt:current:${userId}:${slug}`;
}

export type GetLatestPublishedVersionInput = {
  userId: string;
  slug: string;
};

export class GetLatestPublishedVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
  ) {}

  async execute(
    input: GetLatestPublishedVersionInput,
  ): Promise<PublicPromptDTO | null> {
    const cacheKey = publicPromptCacheKey(input.userId, input.slug);

    const cached = await this.cache.get<PublicPromptDTO>(cacheKey);
    if (cached) return cached;

    let parsedSlug;
    try {
      parsedSlug = parseSlug(input.slug);
    } catch {
      return null;
    }

    const prompt = await this.promptRepo.findBySlug(input.userId, parsedSlug);
    if (!prompt || !prompt.currentVersionId) return null;

    const version = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (!version) return null;

    const dto: PublicPromptDTO = {
      content: version.content,
      version: version.versionNumber,
      updatedAt: prompt.updatedAt.toISOString(),
      commitMessage: version.commitMessage,
    };

    await this.cache.set(cacheKey, dto, CACHE_TTL_SECONDS);
    return dto;
  }
}
