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

export type GitHubRepoAccessResult = {
  defaultBranch: string;
  canWrite: boolean;
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

export type GitHubCommitVersionBackdatedInput = {
  accessToken: string;
  repoFullName: string;
  branch: string;
  path: string;
  content: string;
  commitMessage: string;
  committedAt: Date;
  authorName: string;
  authorEmail: string;
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

  /**
   * PAT mode: check that `accessToken` can reach `repoFullName` and
   * whether it has push (write) access. Throws
   * `GitHubRepoAccessDeniedError` when the repo is invisible to the
   * token (404/403) and `GitHubTokenInvalidError` on 401.
   */
  verifyRepoAccess(
    accessToken: string,
    repoFullName: string,
  ): Promise<GitHubRepoAccessResult>;

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

  /**
   * Backdated commit using the Git Data API. The commit's
   * `author.date` and `committer.date` are both set to
   * `committedAt`. Used by the backfill job to replay history with
   * faithful timestamps. Maps HTTP errors to the same
   * `GitHubCommitGatewayError` codes as `commitVersion`.
   */
  commitVersionBackdated(
    input: GitHubCommitVersionBackdatedInput,
  ): Promise<GitHubCommitVersionResult>;
}
