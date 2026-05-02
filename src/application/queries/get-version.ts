import type { PromptRepository } from "@/application/ports/prompt-repository";
import type { VersionRepository } from "@/application/ports/version-repository";
import { PromptNotFoundError, parseSlug } from "@/domain/prompt";
import {
  VersionNotFoundError,
  type PromptVersion,
  type VersionNumber,
} from "@/domain/prompt-version";

export type GetVersionInput = {
  userId: string;
  slug: string;
  versionNumber: VersionNumber;
};

export class GetVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
  ) {}

  async execute(input: GetVersionInput): Promise<PromptVersion> {
    const slug = parseSlug(input.slug);
    const prompt = await this.promptRepo.findBySlug(input.userId, slug);
    if (!prompt) throw new PromptNotFoundError(input.slug);

    const version = await this.versionRepo.findByPromptIdAndNumber(
      prompt.id,
      input.versionNumber,
    );
    if (!version) throw new VersionNotFoundError(input.versionNumber);
    return version;
  }
}
