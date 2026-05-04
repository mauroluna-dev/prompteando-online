import type { GitHubConnection } from "@/domain/github-connection";

export interface GitHubConnectionRepository {
  save(connection: GitHubConnection): Promise<void>;
  findByUserId(userId: string): Promise<GitHubConnection | null>;
  deleteByUserId(userId: string): Promise<boolean>;
}
