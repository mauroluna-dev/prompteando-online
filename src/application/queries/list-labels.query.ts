import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { PromptNotFoundError, Slug } from "@/domain/prompt";

export type LabelDTO = { label: string; versionNumber: number };

export class ListLabelsQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly labelRepo: LabelRepository,
  ) {}

  async execute(userId: string, rawSlug: string): Promise<LabelDTO[]> {
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const rows = await this.labelRepo.listForPrompt(prompt.id);
    const out: LabelDTO[] = [];
    for (const { label, versionId } of rows) {
      const version = await this.versionRepo.findById(versionId);
      if (version) {
        out.push({ label, versionNumber: version.versionNumber.value });
      }
    }
    return out;
  }
}
