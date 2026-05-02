import type { Cache } from "@/application/ports/cache";
import type { PromptRepository } from "@/application/ports/prompt-repository";
import type { VersionRepository } from "@/application/ports/version-repository";
import { publicPromptCacheKey } from "@/application/queries/get-latest-published-version";
import {
  PromptNotFoundError,
  parseSlug,
  type Slug,
} from "@/domain/prompt";
import {
  parseVersionNumber,
  type PromptVersion,
} from "@/domain/prompt-version";

export type SaveNewVersionInput = {
  userId: string;
  slug: string;
  content: string;
  commitMessage?: string;
};

export type SaveNewVersionResult = {
  version: PromptVersion;
  isNoOp: boolean;
};

export class SaveNewVersionCommand {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly cache: Cache,
  ) {}

  async execute(input: SaveNewVersionInput): Promise<SaveNewVersionResult> {
    const slug: Slug = parseSlug(input.slug);
    const prompt = await this.promptRepo.findBySlug(input.userId, slug);
    if (!prompt) throw new PromptNotFoundError(input.slug);

    const current = await this.versionRepo.findCurrentForPrompt(prompt.id);
    if (current && current.content === input.content) {
      return { version: current, isNoOp: true };
    }

    const count = await this.versionRepo.countForPrompt(prompt.id);
    const trimmedMessage = input.commitMessage?.trim();
    const version: PromptVersion = {
      id: crypto.randomUUID(),
      promptId: prompt.id,
      versionNumber: parseVersionNumber(count + 1),
      content: input.content,
      commitMessage: trimmedMessage && trimmedMessage.length > 0 ? trimmedMessage : null,
      githubCommitSha: null,
      createdAt: new Date(),
    };
    await this.versionRepo.appendNewVersion(version);
    await this.cache.del(publicPromptCacheKey(input.userId, prompt.slug));
    return { version, isNoOp: false };
  }
}
