const credentials: RequestCredentials = "same-origin";
const headers = { "Content-Type": "application/json" };

export type LabelEntry = { label: string; versionNumber: number };

function base(slug: string) {
  return `/api/prompts/${encodeURIComponent(slug)}/labels`;
}

export async function listLabels(slug: string): Promise<LabelEntry[]> {
  const res = await fetch(base(slug), { credentials });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Failed to list labels (${res.status})`);
  return res.json();
}

export async function assignLabel(
  slug: string,
  label: string,
  versionNumber: number,
): Promise<void> {
  const res = await fetch(`${base(slug)}/${encodeURIComponent(label)}`, {
    method: "PUT",
    headers,
    credentials,
    body: JSON.stringify({ versionNumber }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to assign label (${res.status})`);
  }
}

export async function removeLabel(slug: string, label: string): Promise<void> {
  const res = await fetch(`${base(slug)}/${encodeURIComponent(label)}`, {
    method: "DELETE",
    credentials,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove label (${res.status})`);
  }
}
