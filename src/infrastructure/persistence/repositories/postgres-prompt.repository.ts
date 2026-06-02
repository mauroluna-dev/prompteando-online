import { and, desc, eq, like } from "drizzle-orm";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { DB } from "@/infrastructure/persistence/db";
import { prompts } from "@/infrastructure/persistence/schema";
import { Prompt, Slug, type Slug as SlugType } from "@/domain/prompt";

export class PostgresPromptRepository implements PromptRepository {
  constructor(private readonly db: DB) {}

  async save(prompt: Prompt): Promise<void> {
    await this.db
      .insert(prompts)
      .values({
        id: prompt.id,
        userId: prompt.userId,
        name: prompt.name.value,
        slug: prompt.slug.value,
        description: prompt.description,
        currentVersionId: prompt.currentVersionId,
        isTemplate: prompt.isTemplate,
        templateVarMeta: prompt.templateVarMeta,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      })
      .onConflictDoUpdate({
        target: prompts.id,
        set: {
          name: prompt.name.value,
          slug: prompt.slug.value,
          description: prompt.description,
          currentVersionId: prompt.currentVersionId,
          isTemplate: prompt.isTemplate,
          templateVarMeta: prompt.templateVarMeta,
          updatedAt: prompt.updatedAt,
        },
      });
  }

  async findById(promptId: string): Promise<Prompt | null> {
    const rows = await this.db
      .select()
      .from(prompts)
      .where(eq(prompts.id, promptId))
      .limit(1);
    return rows[0] ? Prompt.fromRow(rows[0]) : null;
  }

  async findBySlug(userId: string, slug: SlugType): Promise<Prompt | null> {
    const rows = await this.db
      .select()
      .from(prompts)
      .where(and(eq(prompts.userId, userId), eq(prompts.slug, slug.value)))
      .limit(1);
    return rows[0] ? Prompt.fromRow(rows[0]) : null;
  }

  async findAllByUserId(userId: string): Promise<Prompt[]> {
    const rows = await this.db
      .select()
      .from(prompts)
      .where(eq(prompts.userId, userId))
      .orderBy(desc(prompts.createdAt));
    return rows.map((r) => Prompt.fromRow(r));
  }

  async delete(userId: string, slug: SlugType): Promise<boolean> {
    const result = await this.db
      .delete(prompts)
      .where(and(eq(prompts.userId, userId), eq(prompts.slug, slug.value)))
      .returning({ id: prompts.id });
    return result.length > 0;
  }

  async findNextAvailableSlug(
    userId: string,
    baseSlug: SlugType,
  ): Promise<SlugType> {
    const rows = await this.db
      .select({ slug: prompts.slug })
      .from(prompts)
      .where(
        and(
          eq(prompts.userId, userId),
          like(prompts.slug, `${baseSlug.value}%`),
        ),
      );

    const taken = new Set(rows.map((r) => r.slug));
    if (!taken.has(baseSlug.value)) return baseSlug;

    // baseSlug is taken — find next free baseSlug-N for N >= 2
    let n = 2;
    while (taken.has(`${baseSlug.value}-${n}`)) n++;
    return Slug.parse(`${baseSlug.value}-${n}`);
  }
}
