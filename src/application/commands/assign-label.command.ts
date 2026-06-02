import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  CannotAssignVirtualLabelError,
  Label,
  PromptNotFoundError,
  Slug,
} from "@/domain/prompt";
import { VersionNotFoundError, type VersionNumber } from "@/domain/prompt-version";

/** Points a label (e.g. `production`) at a specific version. Deploy. */
export class AssignLabelCommand {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly labelRepo: LabelRepository,
  ) {}

  async execute(
    userId: string,
    rawSlug: string,
    rawLabel: string,
    versionNumber: VersionNumber,
  ): Promise<void> {
    const label = Label.parse(rawLabel);
    if (label.isVirtualLatest) {
      throw new CannotAssignVirtualLabelError(label.value);
    }
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const version = await this.versionRepo.findByPromptIdAndNumber(
      prompt.id,
      versionNumber,
    );
    if (!version) throw new VersionNotFoundError(versionNumber.value);

    await this.labelRepo.assign(prompt.id, label.value, version.id, new Date());
  }
}
