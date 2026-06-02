import type { Cache } from "@/application/ports/cache.port";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { publicPromptCacheKey } from "@/application/queries/get-latest-published-version.query";
import { extractTemplateVariables, PromptNotFoundError, Slug } from "@/domain/prompt";
import { PromptVersion, VersionNumber } from "@/domain/prompt-version";

export type SaveNewVersionResult = {
  version: PromptVersion;
  isNoOp: boolean;
};

export class SaveNewVersionCommand {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    userId: string,
    rawSlug: string,
    content: string,
    commitMessage?: string,
  ): Promise<SaveNewVersionResult> {
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const current = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (current && current.content === content) {
      return { version: current, isNoOp: true };
    }

    const count = await this.versionRepo.countForPrompt(prompt.id);
    const trimmedMessage = commitMessage?.trim();
    const version = PromptVersion.create(
      this.crypto.randomUUID(),
      prompt.id,
      VersionNumber.parse(count + 1),
      content,
      trimmedMessage && trimmedMessage.length > 0 ? trimmedMessage : null,
      extractTemplateVariables(content),
      new Date(),
    );
    await this.versionRepo.appendNewVersion(version);
    await this.cache.del(publicPromptCacheKey(userId, prompt.slug.value));
    return { version, isNoOp: false };
  }
}
