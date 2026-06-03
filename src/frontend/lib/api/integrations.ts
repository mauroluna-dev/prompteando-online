import type { GitHubConnectionView } from "@/domain/github-connection";

const credentials: RequestCredentials = "same-origin";

export async function getGithubConnection(): Promise<GitHubConnectionView | null> {
  const res = await fetch("/api/integrations/github", { credentials });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load GitHub connection (${res.status})`);
  }
  return res.json();
}

export async function getGithubOAuthUrl(): Promise<string> {
  const res = await fetch("/api/integrations/github/oauth-start", {
    credentials,
  });
  if (!res.ok) {
    throw new Error(`Failed to start GitHub OAuth (${res.status})`);
  }
  const body = (await res.json()) as { url: string };
  return body.url;
}

/** Error codes returned by POST /api/integrations/github/token (422). */
export type ConnectTokenErrorCode =
  | "token-invalid"
  | "repo-access-denied"
  | "repo-write-denied";

export class ConnectGithubTokenError extends Error {
  constructor(readonly code: ConnectTokenErrorCode | "unknown") {
    super(code);
    this.name = "ConnectGithubTokenError";
  }
}

/**
 * P26 — Connect the GitHub integration with a fine-grained PAT scoped
 * to a single repo. Throws ConnectGithubTokenError with a mapped code
 * so the UI can show a precise message.
 */
export async function connectGithubWithToken(
  token: string,
  repoFullName: string,
): Promise<void> {
  const res = await fetch("/api/integrations/github/token", {
    method: "POST",
    credentials,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, repoFullName }),
  });
  if (res.ok) return;

  let code: string | undefined;
  try {
    code = ((await res.json()) as { error?: string }).error;
  } catch {
    /* non-JSON body (e.g. 400 validation) */
  }
  if (
    code === "token-invalid" ||
    code === "repo-access-denied" ||
    code === "repo-write-denied"
  ) {
    throw new ConnectGithubTokenError(code);
  }
  throw new ConnectGithubTokenError("unknown");
}

export async function disconnectGithub(): Promise<void> {
  const res = await fetch("/api/integrations/github", {
    method: "DELETE",
    credentials,
  });
  if (res.status === 204) return;
  if (!res.ok) {
    throw new Error(`Failed to disconnect GitHub (${res.status})`);
  }
}
