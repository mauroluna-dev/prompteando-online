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
