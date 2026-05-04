export class InvalidVersionNumberError extends Error {
  readonly code = "INVALID_VERSION_NUMBER" as const;
  constructor(value: number | string) {
    super(`Invalid version number: ${String(value)}`);
    this.name = "InvalidVersionNumberError";
  }
}

export class VersionNotFoundError extends Error {
  readonly code = "VERSION_NOT_FOUND" as const;
  constructor(versionNumber: number) {
    super(`Version not found: v${versionNumber}`);
    this.name = "VersionNotFoundError";
  }
}

export class GitHubCommitFailedError extends Error {
  readonly code = "GITHUB_COMMIT_FAILED" as const;
  constructor(readonly reason: string) {
    super(`GitHub commit failed: ${reason}`);
    this.name = "GitHubCommitFailedError";
  }
}
