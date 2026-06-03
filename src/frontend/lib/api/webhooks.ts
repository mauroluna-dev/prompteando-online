const credentials: RequestCredentials = "same-origin";
const headers = { "Content-Type": "application/json" };

export type WebhookEvent = "version.created" | "label.assigned";

export type WebhookView = {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
};

export type CreatedWebhook = WebhookView & { secret: string };

export async function listWebhooks(): Promise<WebhookView[]> {
  const res = await fetch("/api/webhooks", { credentials });
  if (!res.ok) throw new Error(`Failed to list webhooks (${res.status})`);
  return res.json();
}

export async function createWebhook(
  url: string,
  events: WebhookEvent[],
): Promise<CreatedWebhook> {
  const res = await fetch("/api/webhooks", {
    method: "POST",
    headers,
    credentials,
    body: JSON.stringify({ url, events }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to create webhook (${res.status})`);
  }
  return res.json();
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete webhook (${res.status})`);
  }
}
