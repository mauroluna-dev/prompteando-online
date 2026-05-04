import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";

export class DisconnectGitHubCommand {
  constructor(private readonly repo: GitHubConnectionRepository) {}

  async execute(userId: string): Promise<void> {
    await this.repo.deleteByUserId(userId);
  }
}
