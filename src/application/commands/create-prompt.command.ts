import type { CryptoPort } from "@/application/ports/crypto.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import { Prompt, PromptName, Slug } from "@/domain/prompt";

export class CreatePromptCommand {
  constructor(
    private readonly repo: PromptRepository,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    userId: string,
    name: string,
    description?: string,
    tags: string[] = [],
  ): Promise<Prompt> {
    const promptName = PromptName.parse(name);
    const baseSlug = Slug.generate(name);
    const slug = await this.repo.findNextAvailableSlug(userId, baseSlug);

    const now = new Date();
    const prompt = Prompt.create(
      this.crypto.randomUUID(),
      userId,
      promptName,
      slug,
      description ?? null,
      now,
      tags.map((t) => t.trim()).filter((t) => t.length > 0),
    );
    await this.repo.save(prompt);
    return prompt;
  }
}
