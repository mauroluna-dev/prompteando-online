import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { Prompt } from "@/domain/prompt";

export class ListPromptsForUserQuery {
  constructor(private readonly repo: PromptRepository) {}

  async execute(userId: string): Promise<Prompt[]> {
    return this.repo.findAllByUserId(userId);
  }
}
