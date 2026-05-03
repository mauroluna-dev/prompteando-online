import type { PromptVersionDTO as PromptVersion } from "@/domain/prompt-version";

const credentials: RequestCredentials = "same-origin";
const headers = { "Content-Type": "application/json" };

export type SaveVersionResult = {
  version: PromptVersion;
  isNoOp: boolean;
};

function basePath(slug: string) {
  return `/api/prompts/${encodeURIComponent(slug)}/versions`;
}

export async function listVersions(slug: string): Promise<PromptVersion[]> {
  const res = await fetch(basePath(slug), { credentials });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Failed to list versions (${res.status})`);
  return res.json();
}

export async function getVersion(
  slug: string,
  versionNumber: number,
): Promise<PromptVersion | null> {
  const res = await fetch(`${basePath(slug)}/${versionNumber}`, { credentials });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load version (${res.status})`);
  return res.json();
}

export async function saveVersion(
  slug: string,
  body: { content: string; commitMessage?: string },
): Promise<SaveVersionResult> {
  const res = await fetch(basePath(slug), {
    method: "POST",
    credentials,
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Failed to save version (${res.status})`);
  }
  const isNoOp = res.headers.get("x-version-noop") === "true";
  const version = (await res.json()) as PromptVersion;
  return { version, isNoOp };
}

export async function restoreVersion(
  slug: string,
  versionNumber: number,
): Promise<SaveVersionResult> {
  const res = await fetch(`${basePath(slug)}/${versionNumber}/restore`, {
    method: "POST",
    credentials,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Failed to restore version (${res.status})`);
  }
  const isNoOp = res.headers.get("x-version-noop") === "true";
  const version = (await res.json()) as PromptVersion;
  return { version, isNoOp };
}
