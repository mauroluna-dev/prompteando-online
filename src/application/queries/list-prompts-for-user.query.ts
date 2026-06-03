import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { Prompt } from "@/domain/prompt";

export type ListPromptsFilter = { q?: string; tag?: string };

export class ListPromptsForUserQuery {
  constructor(private readonly repo: PromptRepository) {}

  async execute(
    userId: string,
    filter: ListPromptsFilter = {},
  ): Promise<Prompt[]> {
    const all = await this.repo.findAllByUserId(userId);
    const q = filter.q?.trim().toLowerCase();
    const tag = filter.tag?.trim().toLowerCase();
    return all.filter((p) => {
      const matchesQ =
        !q ||
        p.name.value.toLowerCase().includes(q) ||
        p.slug.value.toLowerCase().includes(q);
      const matchesTag =
        !tag || p.tags.some((t) => t.toLowerCase() === tag);
      return matchesQ && matchesTag;
    });
  }
}
