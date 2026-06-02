import type { Cache } from "@/application/ports/cache.port";
import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { CONSTANTS, type Prompt, Slug } from "@/domain/prompt";
import type { PromptVersion, PublicPromptDTO } from "@/domain/prompt-version";

const CACHE_TTL_SECONDS = 300;

export function publicPromptCacheKey(userId: string, slug: string): string {
  // v2: DTO shape gained isTemplate + templateVars (P19).
  return `prompt:current:v2:${userId}:${slug}`;
}

function toDTO(prompt: Prompt, version: PromptVersion): PublicPromptDTO {
  return {
    content: version.content,
    version: version.versionNumber.value,
    updatedAt: prompt.updatedAt.toISOString(),
    commitMessage: version.commitMessage,
    isTemplate: prompt.isTemplate,
    templateVars: version.templateVars,
  };
}

export class GetLatestPublishedVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
    private readonly labelRepo: LabelRepository,
  ) {}

  async execute(
    userId: string,
    rawSlug: string,
    label?: string,
  ): Promise<PublicPromptDTO | null> {
    // Non-latest label → resolve via the label table, uncached (labels
    // change rarely; the lookup is two indexed reads).
    if (label && label !== CONSTANTS.VIRTUAL_LATEST_LABEL) {
      return this.resolveByLabel(userId, rawSlug, label);
    }

    const cacheKey = publicPromptCacheKey(userId, rawSlug);
    const cached = await this.cache.get<PublicPromptDTO>(cacheKey);
    if (cached) return cached;

    const parsedSlug = this.tryParseSlug(rawSlug);
    if (!parsedSlug) return null;

    const prompt = await this.promptRepo.findBySlug(userId, parsedSlug);
    if (!prompt || !prompt.currentVersionId) return null;

    const version = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (!version) return null;

    const dto = toDTO(prompt, version);
    await this.cache.set(cacheKey, dto, CACHE_TTL_SECONDS);
    return dto;
  }

  private async resolveByLabel(
    userId: string,
    rawSlug: string,
    label: string,
  ): Promise<PublicPromptDTO | null> {
    const parsedSlug = this.tryParseSlug(rawSlug);
    if (!parsedSlug) return null;
    const prompt = await this.promptRepo.findBySlug(userId, parsedSlug);
    if (!prompt) return null;
    const versionId = await this.labelRepo.findVersionIdByLabel(prompt.id, label);
    if (!versionId) return null;
    const version = await this.versionRepo.findById(versionId);
    if (!version) return null;
    return toDTO(prompt, version);
  }

  private tryParseSlug(rawSlug: string): Slug | null {
    try {
      return Slug.parse(rawSlug);
    } catch {
      return null;
    }
  }
}
