import { and, count, desc, eq } from "drizzle-orm";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import type { DB } from "@/infrastructure/persistence/db";
import {
  promptVersions,
  prompts,
} from "@/infrastructure/persistence/schema";
import {
  PromptVersion,
  type VersionNumber,
} from "@/domain/prompt-version";

export class PostgresVersionRepository implements VersionRepository {
  constructor(private readonly db: DB) {}

  async appendNewVersion(version: PromptVersion): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(promptVersions).values({
        id: version.id,
        promptId: version.promptId,
        versionNumber: version.versionNumber.value,
        content: version.content,
        commitMessage: version.commitMessage,
        githubCommitSha: version.githubCommitSha,
        createdAt: version.createdAt,
      });
      await tx
        .update(prompts)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(prompts.id, version.promptId));
    });
  }

  async findByPromptIdAndNumber(
    promptId: string,
    versionNumber: VersionNumber,
  ): Promise<PromptVersion | null> {
    const rows = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptId),
          eq(promptVersions.versionNumber, versionNumber.value),
        ),
      )
      .limit(1);
    return rows[0] ? PromptVersion.fromRow(rows[0]) : null;
  }

  async findCurrentForPrompt(promptId: string): Promise<PromptVersion | null> {
    const rows = await this.db
      .select({ version: promptVersions })
      .from(prompts)
      .innerJoin(
        promptVersions,
        eq(promptVersions.id, prompts.currentVersionId),
      )
      .where(eq(prompts.id, promptId))
      .limit(1);
    return rows[0] ? PromptVersion.fromRow(rows[0].version) : null;
  }

  async findAllForPrompt(promptId: string): Promise<PromptVersion[]> {
    const rows = await this.db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptId, promptId))
      .orderBy(desc(promptVersions.versionNumber));
    return rows.map((r) => PromptVersion.fromRow(r));
  }

  async countForPrompt(promptId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(promptVersions)
      .where(eq(promptVersions.promptId, promptId));
    return rows[0]?.value ?? 0;
  }
}
