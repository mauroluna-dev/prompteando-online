import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import {
  CannotAssignVirtualLabelError,
  Label,
  LabelNotFoundError,
  PromptNotFoundError,
  Slug,
} from "@/domain/prompt";

export class RemoveLabelCommand {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly labelRepo: LabelRepository,
  ) {}

  async execute(userId: string, rawSlug: string, rawLabel: string): Promise<void> {
    const label = Label.parse(rawLabel);
    if (label.isVirtualLatest) {
      throw new CannotAssignVirtualLabelError(label.value);
    }
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const removed = await this.labelRepo.remove(prompt.id, label.value);
    if (!removed) throw new LabelNotFoundError(label.value);
  }
}
