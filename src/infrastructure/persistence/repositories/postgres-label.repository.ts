import { and, eq } from "drizzle-orm";
import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { DB } from "@/infrastructure/persistence/db";
import { promptLabels } from "@/infrastructure/persistence/schema";

export class PostgresLabelRepository implements LabelRepository {
  constructor(private readonly db: DB) {}

  async assign(
    promptId: string,
    label: string,
    versionId: string,
    now: Date,
  ): Promise<void> {
    await this.db
      .insert(promptLabels)
      .values({ promptId, label, versionId, updatedAt: now })
      .onConflictDoUpdate({
        target: [promptLabels.promptId, promptLabels.label],
        set: { versionId, updatedAt: now },
      });
  }

  async remove(promptId: string, label: string): Promise<boolean> {
    const result = await this.db
      .delete(promptLabels)
      .where(
        and(eq(promptLabels.promptId, promptId), eq(promptLabels.label, label)),
      )
      .returning({ id: promptLabels.id });
    return result.length > 0;
  }

  async findVersionIdByLabel(
    promptId: string,
    label: string,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ versionId: promptLabels.versionId })
      .from(promptLabels)
      .where(
        and(eq(promptLabels.promptId, promptId), eq(promptLabels.label, label)),
      )
      .limit(1);
    return rows[0]?.versionId ?? null;
  }

  async listForPrompt(
    promptId: string,
  ): Promise<{ label: string; versionId: string }[]> {
    return this.db
      .select({ label: promptLabels.label, versionId: promptLabels.versionId })
      .from(promptLabels)
      .where(eq(promptLabels.promptId, promptId));
  }
}
