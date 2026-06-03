import type { PromptDTO as Prompt, TemplateVarMeta } from "@/domain/prompt";

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
  tags?: string[];
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

// ── P19 — template variables ──

export type TemplateSettingsInput = {
  isTemplate?: boolean;
  varMeta?: TemplateVarMeta;
};

export async function updateTemplateSettings(
  slug: string,
  input: TemplateSettingsInput,
): Promise<Prompt> {
  const res = await fetch(`/api/prompts/${encodeURIComponent(slug)}/template`, {
    method: "PATCH",
    headers,
    credentials,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to update template settings (${res.status})`);
  }
  return res.json();
}

export type RenderPreviewOk = {
  ok: true;
  content: string;
  version: number;
  varsUsed: string[];
};

export type RenderPreviewErr = {
  ok: false;
  status: number;
  error: string;
  missingVars: string[];
};

export async function renderPreview(
  slug: string,
  vars: Record<string, string>,
  version?: number,
): Promise<RenderPreviewOk | RenderPreviewErr> {
  const res = await fetch(
    `/api/prompts/${encodeURIComponent(slug)}/render-preview`,
    {
      method: "POST",
      headers,
      credentials,
      body: JSON.stringify({ vars, version }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    content?: string;
    version?: number;
    vars_used?: string[];
    missing_vars?: string[];
    error?: string;
  } | null;
  if (res.ok && body) {
    return {
      ok: true,
      content: body.content ?? "",
      version: body.version ?? 0,
      varsUsed: body.vars_used ?? [],
    };
  }
  return {
    ok: false,
    status: res.status,
    error: body?.error ?? `Error ${res.status}`,
    missingVars: body?.missing_vars ?? [],
  };
}
