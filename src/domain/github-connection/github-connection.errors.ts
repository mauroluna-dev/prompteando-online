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

/** PAT mode: the provided token is missing/expired/revoked (GitHub 401). */
export class GitHubTokenInvalidError extends Error {
  readonly code = "GITHUB_TOKEN_INVALID" as const;
  constructor(reason?: string) {
    const suffix = reason ? `: ${reason}` : "";
    super(`GitHub token invalid${suffix}`);
    this.name = "GitHubTokenInvalidError";
  }
}

/** PAT mode: the token has no access to the requested repo (GitHub 403/404). */
export class GitHubRepoAccessDeniedError extends Error {
  readonly code = "GITHUB_REPO_ACCESS_DENIED" as const;
  constructor(readonly repoFullName: string) {
    super(`GitHub token has no access to repo: ${repoFullName}`);
    this.name = "GitHubRepoAccessDeniedError";
  }
}

/** PAT mode: the token can read the repo but lacks write (Contents) access. */
export class GitHubRepoWriteDeniedError extends Error {
  readonly code = "GITHUB_REPO_WRITE_DENIED" as const;
  constructor(readonly repoFullName: string) {
    super(`GitHub token lacks write access to repo: ${repoFullName}`);
    this.name = "GitHubRepoWriteDeniedError";
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

export class BackfillStateTransitionError extends Error {
  readonly code = "BACKFILL_STATE_TRANSITION" as const;
  constructor(
    readonly from: string | null,
    readonly to: string,
  ) {
    super(`Cannot transition backfill state from ${from ?? "null"} to ${to}`);
    this.name = "BackfillStateTransitionError";
  }
}
