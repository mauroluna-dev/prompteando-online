import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import type { GitHubGateway } from "@/application/ports/github-gateway.port";
import {
  CONSTANTS,
  GitHubConnection,
  GitHubInsufficientScopeError,
  RepoFullName,
} from "@/domain/github-connection";

export class ConnectGitHubCommand {
  constructor(
    private readonly repo: GitHubConnectionRepository,
    private readonly gateway: GitHubGateway,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(userId: string, code: string): Promise<GitHubConnection> {
    const { accessToken, scopes } =
      await this.gateway.exchangeCodeForToken(code);

    const missing = CONSTANTS.REQUIRED_SCOPES.filter(
      (s) => !scopes.includes(s),
    );
    if (missing.length > 0) {
      throw new GitHubInsufficientScopeError(missing);
    }

    const { login } = await this.gateway.getAuthenticatedUser(accessToken);
    const repoName = `${CONSTANTS.REPO_NAME_PREFIX}${login}`;

    const { fullName, defaultBranch } = await this.gateway.ensureRepo(
      accessToken,
      repoName,
    );
    await this.gateway.ensureReadme(accessToken, fullName, defaultBranch);

    const connection = GitHubConnection.create(
      userId,
      login,
      this.crypto.encrypt(accessToken),
      scopes,
      RepoFullName.parse(fullName),
      defaultBranch,
      new Date(),
    );
    await this.repo.save(connection);
    return connection;
  }
}
