import { and, desc, eq, like } from "drizzle-orm";
import type { PromptRepository } from "@/application/ports/prompt-repository";
import type { DB } from "@/infrastructure/persistence/db";
import { prompts } from "@/infrastructure/persistence/schema";
import {
  parsePromptName,
  parseSlug,
  type Prompt,
  type Slug,
} from "@/domain/prompt";

type Row = typeof prompts.$inferSelect;

function mapRow(row: Row): Prompt {
  return {
    id: row.id,
    userId: row.userId,
    name: parsePromptName(row.name),
    slug: parseSlug(row.slug),
    description: row.description,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresPromptRepository implements PromptRepository {
  constructor(private readonly db: DB) {}

  async save(prompt: Prompt): Promise<void> {
    await this.db
      .insert(prompts)
      .values({
        id: prompt.id,
        userId: prompt.userId,
        name: prompt.name,
        slug: prompt.slug,
        description: prompt.description,
        currentVersionId: prompt.currentVersionId,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      })
      .onConflictDoUpdate({
        target: prompts.id,
        set: {
          name: prompt.name,
          slug: prompt.slug,
          description: prompt.description,
          currentVersionId: prompt.currentVersionId,
          updatedAt: prompt.updatedAt,
        },
      });
  }

  async findBySlug(userId: string, slug: Slug): Promise<Prompt | null> {
    const rows = await this.db
      .select()
      .from(prompts)
      .where(and(eq(prompts.userId, userId), eq(prompts.slug, slug)))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findAllByUserId(userId: string): Promise<Prompt[]> {
    const rows = await this.db
      .select()
      .from(prompts)
      .where(eq(prompts.userId, userId))
      .orderBy(desc(prompts.createdAt));
    return rows.map(mapRow);
  }

  async delete(userId: string, slug: Slug): Promise<boolean> {
    const result = await this.db
      .delete(prompts)
      .where(and(eq(prompts.userId, userId), eq(prompts.slug, slug)))
      .returning({ id: prompts.id });
    return result.length > 0;
  }

  async findNextAvailableSlug(userId: string, baseSlug: Slug): Promise<Slug> {
    const rows = await this.db
      .select({ slug: prompts.slug })
      .from(prompts)
      .where(
        and(eq(prompts.userId, userId), like(prompts.slug, `${baseSlug}%`)),
      );

    const taken = new Set(rows.map((r) => r.slug));
    if (!taken.has(baseSlug)) return baseSlug;

    // baseSlug is taken — find next free baseSlug-N for N >= 2
    let n = 2;
    while (taken.has(`${baseSlug}-${n}`)) n++;
    return parseSlug(`${baseSlug}-${n}`);
  }
}
