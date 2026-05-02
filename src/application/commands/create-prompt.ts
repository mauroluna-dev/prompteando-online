import type { PromptRepository } from "@/application/ports/prompt-repository";
import {
  PromptDescriptionTooLongError,
  generateSlug,
  parsePromptName,
  type Prompt,
} from "@/domain/prompt";

export type CreatePromptInput = {
  userId: string;
  name: string;
  description?: string;
};

const MAX_DESCRIPTION_LENGTH = 500;

export class CreatePromptCommand {
  constructor(private readonly repo: PromptRepository) {}

  async execute(input: CreatePromptInput): Promise<Prompt> {
    const promptName = parsePromptName(input.name);
    const baseSlug = generateSlug(input.name);
    const slug = await this.repo.findNextAvailableSlug(input.userId, baseSlug);

    if (input.description && input.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new PromptDescriptionTooLongError(MAX_DESCRIPTION_LENGTH);
    }

    const now = new Date();
    const prompt: Prompt = {
      id: crypto.randomUUID(),
      userId: input.userId,
      name: promptName,
      slug,
      description: input.description ?? null,
      currentVersionId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.save(prompt);
    return prompt;
  }
}
