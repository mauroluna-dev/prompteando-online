import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
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
        type: version.type,
        content: version.content,
        commitMessage: version.commitMessage,
        githubCommitSha: version.githubCommitSha,
        githubSyncError: version.githubSyncError,
        templateVars: version.templateVars,
        config: version.config,
        createdAt: version.createdAt,
      });
      await tx
        .update(prompts)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(prompts.id, version.promptId));
    });
  }

  async findById(versionId: string): Promise<PromptVersion | null> {
    const rows = await this.db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, versionId))
      .limit(1);
    return rows[0] ? PromptVersion.fromRow(rows[0]) : null;
  }

  async markGithubCommit(versionId: string, sha: string): Promise<void> {
    await this.db
      .update(promptVersions)
      .set({ githubCommitSha: sha, githubSyncError: null })
      .where(eq(promptVersions.id, versionId));
  }

  async markGithubSyncFailed(
    versionId: string,
    error: string,
  ): Promise<void> {
    await this.db
      .update(promptVersions)
      .set({ githubSyncError: error })
      .where(eq(promptVersions.id, versionId));
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

  async findOldestPendingForUser(userId: string): Promise<{
    version: PromptVersion;
    promptName: string;
    promptSlug: string;
  } | null> {
    const rows = await this.db
      .select({
        id: promptVersions.id,
        promptId: promptVersions.promptId,
        versionNumber: promptVersions.versionNumber,
        type: promptVersions.type,
        content: promptVersions.content,
        commitMessage: promptVersions.commitMessage,
        githubCommitSha: promptVersions.githubCommitSha,
        githubSyncError: promptVersions.githubSyncError,
        templateVars: promptVersions.templateVars,
        config: promptVersions.config,
        createdAt: promptVersions.createdAt,
        promptName: prompts.name,
        promptSlug: prompts.slug,
      })
      .from(promptVersions)
      .innerJoin(prompts, eq(prompts.id, promptVersions.promptId))
      .where(
        and(
          eq(prompts.userId, userId),
          isNull(promptVersions.githubCommitSha),
          isNull(promptVersions.githubSyncError),
        ),
      )
      .orderBy(asc(promptVersions.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      version: PromptVersion.fromRow({
        id: row.id,
        promptId: row.promptId,
        versionNumber: row.versionNumber,
        type: row.type,
        content: row.content,
        commitMessage: row.commitMessage,
        githubCommitSha: row.githubCommitSha,
        githubSyncError: row.githubSyncError,
        templateVars: row.templateVars,
        config: row.config,
        createdAt: row.createdAt,
      }),
      promptName: row.promptName,
      promptSlug: row.promptSlug,
    };
  }

  async countPendingForUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(promptVersions)
      .innerJoin(prompts, eq(prompts.id, promptVersions.promptId))
      .where(
        and(
          eq(prompts.userId, userId),
          isNull(promptVersions.githubCommitSha),
          isNull(promptVersions.githubSyncError),
        ),
      );
    return rows[0]?.value ?? 0;
  }
}
