import { useVersions } from "./use-versions";

/**
 * P17 — Resolve the contents of two versions for diffing.
 *
 * Reuses the existing useVersions SWR cache (no extra fetch). When
 * either version is not in the list (race with delete, bad URL),
 * the corresponding `content` is null.
 */
export function useVersionDiff(
  slug: string | undefined,
  versionA: number | null,
  versionB: number | null,
): {
  contentA: string | null;
  contentB: string | null;
  isLoading: boolean;
} {
  const { data: versions, isLoading } = useVersions(slug);
  if (isLoading || !versions) {
    return { contentA: null, contentB: null, isLoading };
  }
  const a = versionA !== null
    ? versions.find((v) => v.versionNumber === versionA)
    : undefined;
  const b = versionB !== null
    ? versions.find((v) => v.versionNumber === versionB)
    : undefined;
  return {
    contentA: a?.content ?? null,
    contentB: b?.content ?? null,
    isLoading: false,
  };
}
