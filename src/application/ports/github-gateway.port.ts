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
}
