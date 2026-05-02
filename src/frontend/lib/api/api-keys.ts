import type { ApiKeyView } from "@/domain/api-key";

const credentials: RequestCredentials = "same-origin";
const headers = { "Content-Type": "application/json" };

export type CreateApiKeyResponse = {
  apiKey: ApiKeyView;
  plaintext: string;
};

export async function listApiKeys(): Promise<ApiKeyView[]> {
  const res = await fetch("/api/keys", { credentials });
  if (!res.ok) throw new Error(`Failed to list API keys (${res.status})`);
  return res.json();
}

export async function createApiKey(input: {
  name: string;
}): Promise<CreateApiKeyResponse> {
  const res = await fetch("/api/keys", {
    method: "POST",
    credentials,
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 429) {
      throw new Error(body?.error ?? "API key quota exceeded");
    }
    throw new Error(body?.error ?? `Failed to create API key (${res.status})`);
  }
  return res.json();
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials,
  });
  if (res.status === 204) return;
  if (res.status === 410) return; // already revoked, idempotent on the client
  if (!res.ok) {
    throw new Error(`Failed to revoke API key (${res.status})`);
  }
}
