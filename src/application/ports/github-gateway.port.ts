export type GitHubTokenExchange = {
  accessToken: string;
  scopes: string[];
};

export type GitHubAuthenticatedUser = {
  login: string;
};

export type GitHubEnsureRepoResult = {
  fullName: string;
  defaultBranch: string;
  wasCreated: boolean;
};

export type GitHubEnsureReadmeResult = {
  committed: boolean;
  sha?: string;
};

export type GitHubCommitVersionInput = {
  accessToken: string;
  repoFullName: string;
  branch: string;
  path: string;
  content: string;
  commitMessage: string;
};

export type GitHubCommitVersionResult = {
  sha: string;
};

export type GitHubCommitErrorCode =
  | "token_invalid"
  | "insufficient_scope"
  | "repo_missing"
  | "rate_limited"
  | "transient"
  | "unknown";

export class GitHubCommitGatewayError extends Error {
  constructor(
    readonly code: GitHubCommitErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GitHubCommitGatewayError";
  }
}

export interface GitHubGateway {
  exchangeCodeForToken(code: string): Promise<GitHubTokenExchange>;

  getAuthenticatedUser(accessToken: string): Promise<GitHubAuthenticatedUser>;

  ensureRepo(
    accessToken: string,
    repoName: string,
  ): Promise<GitHubEnsureRepoResult>;

  ensureReadme(
    accessToken: string,
    repoFullName: string,
    defaultBranch: string,
  ): Promise<GitHubEnsureReadmeResult>;

  /**
   * Create or update a file at `path` in `repoFullName` on `branch`.
   * Implementations must fetch the current SHA when the file exists
   * and pass it through, so that successive commits chain correctly.
   * On HTTP errors, throws `GitHubCommitGatewayError` with a mapped
   * `code` (transient codes are retryable; others are not).
   */
  commitVersion(
    input: GitHubCommitVersionInput,
  ): Promise<GitHubCommitVersionResult>;
}
