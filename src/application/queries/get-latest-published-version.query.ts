import type { Cache } from "@/application/ports/cache.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { Slug } from "@/domain/prompt";
import type { PublicPromptDTO } from "@/domain/prompt-version";

const CACHE_TTL_SECONDS = 300;

export function publicPromptCacheKey(userId: string, slug: string): string {
  // v2: DTO shape gained isTemplate + templateVars (P19).
  return `prompt:current:v2:${userId}:${slug}`;
}

export class GetLatestPublishedVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
  ) {}

  async execute(
    userId: string,
    rawSlug: string,
  ): Promise<PublicPromptDTO | null> {
    const cacheKey = publicPromptCacheKey(userId, rawSlug);

    const cached = await this.cache.get<PublicPromptDTO>(cacheKey);
    if (cached) return cached;

    let parsedSlug;
    try {
      parsedSlug = Slug.parse(rawSlug);
    } catch {
      return null;
    }

    const prompt = await this.promptRepo.findBySlug(userId, parsedSlug);
    if (!prompt || !prompt.currentVersionId) return null;

    const version = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (!version) return null;

    const dto: PublicPromptDTO = {
      content: version.content,
      version: version.versionNumber.value,
      updatedAt: prompt.updatedAt.toISOString(),
      commitMessage: version.commitMessage,
      isTemplate: prompt.isTemplate,
      templateVars: version.templateVars,
    };

    await this.cache.set(cacheKey, dto, CACHE_TTL_SECONDS);
    return dto;
  }
}
