import {
  GitHubCommitGatewayError,
  type GitHubCommitErrorCode,
} from "@/application/ports/github-gateway.port";

/**
 * Map an HTTP error from Octokit into a typed `GitHubCommitGatewayError`.
 * The `code` controls retry policy in `CommitVersionToGitHubJob`:
 * `transient` and `rate_limited` are retried; everything else aborts.
 */
export function mapCommitError(err: unknown): GitHubCommitGatewayError {
  const status = statusOf(err);
  const message = messageOf(err);
  const code: GitHubCommitErrorCode = (() => {
    if (status === 401) return "token_invalid";
    if (status === 403) {
      return /secondary rate limit|rate limit/i.test(message)
        ? "rate_limited"
        : "insufficient_scope";
    }
    if (status === 404) return "repo_missing";
    if (status === 409 || status === 422) return "transient";
    if (status !== undefined && status >= 500) return "transient";
    return "unknown";
  })();
  return new GitHubCommitGatewayError(code, message);
}

export function statusOf(err: unknown): number | undefined {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return undefined;
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
