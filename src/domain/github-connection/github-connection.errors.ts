export class GitHubConnectionNotFoundError extends Error {
  readonly code = "GITHUB_CONNECTION_NOT_FOUND" as const;
  constructor(userId: string) {
    super(`GitHub connection not found for user: ${userId}`);
    this.name = "GitHubConnectionNotFoundError";
  }
}

export class GitHubOAuthFailedError extends Error {
  readonly code = "GITHUB_OAUTH_FAILED" as const;
  constructor(reason: string) {
    super(`GitHub OAuth failed: ${reason}`);
    this.name = "GitHubOAuthFailedError";
  }
}

export class GitHubInsufficientScopeError extends Error {
  readonly code = "GITHUB_INSUFFICIENT_SCOPE" as const;
  constructor(readonly missing: readonly string[]) {
    super(`GitHub scope insufficient; missing: ${missing.join(", ")}`);
    this.name = "GitHubInsufficientScopeError";
  }
}

export class GitHubRepoCreationFailedError extends Error {
  readonly code = "GITHUB_REPO_CREATION_FAILED" as const;
  constructor(cause: string) {
    super(`GitHub repo creation failed: ${cause}`);
    this.name = "GitHubRepoCreationFailedError";
  }
}

export class InvalidOAuthStateError extends Error {
  readonly code = "INVALID_OAUTH_STATE" as const;
  constructor(reason: string) {
    super(`Invalid OAuth state: ${reason}`);
    this.name = "InvalidOAuthStateError";
  }
}

export class InvalidRepoFullNameError extends Error {
  readonly code = "INVALID_REPO_FULL_NAME" as const;
  constructor(value: string) {
    super(`Invalid repo full name: "${value}"`);
    this.name = "InvalidRepoFullNameError";
  }
}
