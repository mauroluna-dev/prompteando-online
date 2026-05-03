import useSWR from "swr";
import type { PromptVersionDTO as PromptVersion } from "@/domain/prompt-version";
import { getVersion, listVersions } from "@/frontend/lib/api/versions";

export function useVersions(slug: string | undefined) {
  return useSWR<PromptVersion[]>(
    slug ? `/api/prompts/${slug}/versions` : null,
    () => (slug ? listVersions(slug) : []),
  );
}

export function useVersion(
  slug: string | undefined,
  versionNumber: number | null,
) {
  return useSWR<PromptVersion | null>(
    slug && versionNumber !== null
      ? `/api/prompts/${slug}/versions/${versionNumber}`
      : null,
    () => (slug && versionNumber !== null ? getVersion(slug, versionNumber) : null),
  );
}
