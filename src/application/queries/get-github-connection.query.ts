import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import type { GitHubConnection } from "@/domain/github-connection";

export class GetGitHubConnectionQuery {
  constructor(private readonly repo: GitHubConnectionRepository) {}

  async execute(userId: string): Promise<GitHubConnection | null> {
    return this.repo.findByUserId(userId);
  }
}
