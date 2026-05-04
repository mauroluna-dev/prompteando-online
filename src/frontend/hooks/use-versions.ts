import useSWR from "swr";
import type { PromptVersionDTO as PromptVersion } from "@/domain/prompt-version";
import { getVersion, listVersions } from "@/frontend/lib/api/versions";

const SYNC_POLL_MS = 5000;

export function useVersions(
  slug: string | undefined,
  options: { trackGithubSync?: boolean } = {},
) {
  const { trackGithubSync = false } = options;
  return useSWR<PromptVersion[]>(
    slug ? `/api/prompts/${slug}/versions` : null,
    () => (slug ? listVersions(slug) : []),
    {
      refreshInterval: trackGithubSync
        ? (latest) => {
            if (!latest) return 0;
            const pending = latest.some(
              (v) =>
                v.githubCommitSha === null && v.githubSyncError === null,
            );
            return pending ? SYNC_POLL_MS : 0;
          }
        : 0,
    },
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
