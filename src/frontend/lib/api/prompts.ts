import type { PromptDTO as Prompt } from "@/domain/prompt";

const headers = { "Content-Type": "application/json" };
const credentials: RequestCredentials = "same-origin";

export async function listPrompts(): Promise<Prompt[]> {
  const res = await fetch("/api/prompts", { credentials });
  if (!res.ok) throw new Error(`Failed to list prompts (${res.status})`);
  return res.json();
}

export async function getPrompt(slug: string): Promise<Prompt | null> {
  const res = await fetch(`/api/prompts/${encodeURIComponent(slug)}`, {
    credentials,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load prompt (${res.status})`);
  return res.json();
}

export async function createPrompt(input: {
  name: string;
  description?: string;
}): Promise<Prompt> {
  const res = await fetch("/api/prompts", {
    method: "POST",
    headers,
    credentials,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to create prompt (${res.status})`);
  }
  return res.json();
}

export async function deletePrompt(slug: string): Promise<void> {
  const res = await fetch(`/api/prompts/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    credentials,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete prompt (${res.status})`);
  }
}
