import type { Prompt, Slug } from "@/domain/prompt";

export interface PromptRepository {
  save(prompt: Prompt): Promise<void>;
  findById(promptId: string): Promise<Prompt | null>;
  findBySlug(userId: string, slug: Slug): Promise<Prompt | null>;
  findAllByUserId(userId: string): Promise<Prompt[]>;
  delete(userId: string, slug: Slug): Promise<boolean>;
  /**
   * Returns `baseSlug` if free for the user, otherwise the next
   * available variant `baseSlug-N` (N >= 2).
   */
  findNextAvailableSlug(userId: string, baseSlug: Slug): Promise<Slug>;
}
