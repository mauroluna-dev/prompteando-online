import { eq } from "drizzle-orm";
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
}
