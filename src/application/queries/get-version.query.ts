import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { PromptNotFoundError, Slug } from "@/domain/prompt";
import {
  VersionNotFoundError,
  type PromptVersion,
  type VersionNumber,
} from "@/domain/prompt-version";

export class GetVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
  ) {}

  async execute(
    userId: string,
    rawSlug: string,
    versionNumber: VersionNumber,
  ): Promise<PromptVersion> {
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const version = await this.versionRepo.findByPromptIdAndNumber(
      prompt.id,
      versionNumber,
    );
    if (!version) throw new VersionNotFoundError(versionNumber.value);
    return version;
  }
}
