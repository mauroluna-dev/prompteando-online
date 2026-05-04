import { eq, inArray } from "drizzle-orm";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import { GitHubConnection } from "@/domain/github-connection";
import type { DB } from "@/infrastructure/persistence/db";
import { userGithubConnection } from "@/infrastructure/persistence/schema";

export class PostgresGitHubConnectionRepository
  implements GitHubConnectionRepository
{
  constructor(private readonly db: DB) {}

  async save(connection: GitHubConnection): Promise<void> {
    const values = {
      userId: connection.userId,
      githubLogin: connection.githubLogin,
      encryptedAccessToken: connection.encryptedAccessToken,
      scopes: [...connection.scopes],
      repoFullName: connection.repoFullName.value,
      defaultBranch: connection.defaultBranch,
      connectedAt: connection.connectedAt,
      backfillStatus: connection.backfillStatus,
      backfillTotal: connection.backfillTotal,
      backfillProcessed: connection.backfillProcessed,
      backfillStartedAt: connection.backfillStartedAt,
      backfillFinishedAt: connection.backfillFinishedAt,
      backfillFailureReason: connection.backfillFailureReason,
    };
    await this.db
      .insert(userGithubConnection)
      .values(values)
      .onConflictDoUpdate({
        target: userGithubConnection.userId,
        set: {
          githubLogin: values.githubLogin,
          encryptedAccessToken: values.encryptedAccessToken,
          scopes: values.scopes,
          repoFullName: values.repoFullName,
          defaultBranch: values.defaultBranch,
          connectedAt: values.connectedAt,
          // Reset backfill state on reconnect — the user is starting
          // a new ciclo and the next call to BackfillGitHubHistoryJob
          // must re-arrancar from null.
          backfillStatus: null,
          backfillTotal: null,
          backfillProcessed: null,
          backfillStartedAt: null,
          backfillFinishedAt: null,
          backfillFailureReason: null,
        },
      });
  }

  async findByUserId(userId: string): Promise<GitHubConnection | null> {
    const rows = await this.db
      .select()
      .from(userGithubConnection)
      .where(eq(userGithubConnection.userId, userId))
      .limit(1);
    return rows[0] ? GitHubConnection.fromRow(rows[0]) : null;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.db
      .delete(userGithubConnection)
      .where(eq(userGithubConnection.userId, userId))
      .returning({ userId: userGithubConnection.userId });
    return result.length > 0;
  }

  async updateBackfillState(connection: GitHubConnection): Promise<void> {
    await this.db
      .update(userGithubConnection)
      .set({
        backfillStatus: connection.backfillStatus,
        backfillTotal: connection.backfillTotal,
        backfillProcessed: connection.backfillProcessed,
        backfillStartedAt: connection.backfillStartedAt,
        backfillFinishedAt: connection.backfillFinishedAt,
        backfillFailureReason: connection.backfillFailureReason,
      })
      .where(eq(userGithubConnection.userId, connection.userId));
  }

  async findUnfinishedBackfills(): Promise<GitHubConnection[]> {
    const rows = await this.db
      .select()
      .from(userGithubConnection)
      .where(
        inArray(userGithubConnection.backfillStatus, ["pending", "running"]),
      );
    return rows.map((r) => GitHubConnection.fromRow(r));
  }
}
