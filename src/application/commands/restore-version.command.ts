import type { Cache } from "@/application/ports/cache.port";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { publicPromptCacheKey } from "@/application/queries/get-latest-published-version.query";
import { PromptNotFoundError, Slug } from "@/domain/prompt";
import {
  PromptVersion,
  VersionNotFoundError,
  VersionNumber,
} from "@/domain/prompt-version";

export type RestoreVersionResult = {
  version: PromptVersion;
  isNoOp: boolean;
};

export class RestoreVersionCommand {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    userId: string,
    rawSlug: string,
    versionNumber: VersionNumber,
  ): Promise<RestoreVersionResult> {
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const target = await this.versionRepo.findByPromptIdAndNumber(
      prompt.id,
      versionNumber,
    );
    if (!target) throw new VersionNotFoundError(versionNumber.value);

    const current = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (current && current.content === target.content) {
      return { version: current, isNoOp: true };
    }

    const count = await this.versionRepo.countForPrompt(prompt.id);
    const version = PromptVersion.create(
      this.crypto.randomUUID(),
      prompt.id,
      VersionNumber.parse(count + 1),
      target.content,
      `Restore v${versionNumber.value}`,
      new Date(),
    );
    await this.versionRepo.appendNewVersion(version);
    await this.cache.del(publicPromptCacheKey(userId, prompt.slug.value));
    return { version, isNoOp: false };
  }
}
