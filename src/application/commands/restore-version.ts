import type { Cache } from "@/application/ports/cache";
import type { PromptRepository } from "@/application/ports/prompt-repository";
import type { VersionRepository } from "@/application/ports/version-repository";
import { publicPromptCacheKey } from "@/application/queries/get-latest-published-version";
import { PromptNotFoundError, parseSlug } from "@/domain/prompt";
import {
  VersionNotFoundError,
  parseVersionNumber,
  type PromptVersion,
  type VersionNumber,
} from "@/domain/prompt-version";

export type RestoreVersionInput = {
  userId: string;
  slug: string;
  versionNumber: VersionNumber;
};

export type RestoreVersionResult = {
  version: PromptVersion;
  isNoOp: boolean;
};

export class RestoreVersionCommand {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
  ) {}

  async execute(input: RestoreVersionInput): Promise<RestoreVersionResult> {
    const slug = parseSlug(input.slug);
    const prompt = await this.promptRepo.findBySlug(input.userId, slug);
    if (!prompt) throw new PromptNotFoundError(input.slug);

    const target = await this.versionRepo.findByPromptIdAndNumber(
      prompt.id,
      input.versionNumber,
    );
    if (!target) throw new VersionNotFoundError(input.versionNumber);

    const current = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (current && current.content === target.content) {
      return { version: current, isNoOp: true };
    }

    const count = await this.versionRepo.countForPrompt(prompt.id);
    const version: PromptVersion = {
      id: crypto.randomUUID(),
      promptId: prompt.id,
      versionNumber: parseVersionNumber(count + 1),
      content: target.content,
      commitMessage: `Restore v${input.versionNumber}`,
      githubCommitSha: null,
      createdAt: new Date(),
    };
    await this.versionRepo.appendNewVersion(version);
    await this.cache.del(publicPromptCacheKey(input.userId, prompt.slug));
    return { version, isNoOp: false };
  }
}
