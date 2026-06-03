import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import type { GitHubGateway } from "@/application/ports/github-gateway.port";
import {
  GitHubConnection,
  GitHubRepoWriteDeniedError,
  RepoFullName,
} from "@/domain/github-connection";

/**
 * P26 — Connect the GitHub integration with a fine-grained PAT scoped
 * to a single user-chosen repo (the "paranoid" path, alongside the
 * OAuth `repo` flow in ConnectGitHubCommand).
 *
 * Unlike OAuth, we do NOT create a repo or write a README: the repo is
 * the user's own, already existing, and we only verify the token can
 * write to it. Commits land in `prompts/<slug>.md` on first save /
 * backfill — same as OAuth mode.
 */
export class ConnectGitHubWithTokenCommand {
  constructor(
    private readonly repo: GitHubConnectionRepository,
    private readonly gateway: GitHubGateway,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    userId: string,
    rawToken: string,
    repoFullNameRaw: string,
  ): Promise<GitHubConnection> {
    // Parse first so a malformed `owner/repo` fails before any network
    // call (and before we ever touch the token).
    const repoFullName = RepoFullName.parse(repoFullNameRaw);

    // verifyRepoAccess hits GitHub with the token, so it doubles as the
    // token-validity check: a bad/expired/revoked PAT surfaces as
    // GitHubTokenInvalidError (401), and no-access as
    // GitHubRepoAccessDeniedError (403/404).
    const { defaultBranch, canWrite } = await this.gateway.verifyRepoAccess(
      rawToken,
      repoFullName.value,
    );
    if (!canWrite) {
      throw new GitHubRepoWriteDeniedError(repoFullName.value);
    }

    // Token is known good at this point — getAuthenticatedUser is just
    // for the login we store as `githubLogin`.
    const { login } = await this.gateway.getAuthenticatedUser(rawToken);

    const connection = GitHubConnection.createWithToken(
      userId,
      login,
      this.crypto.encrypt(rawToken),
      repoFullName,
      defaultBranch,
      new Date(),
    );
    await this.repo.save(connection);
    return connection;
  }
}
