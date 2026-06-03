import { CONSTANTS } from "./constants";

/** Slugs referenced via `{{>slug}}` in `content`, deduped, in order. */
export function extractIncludes(content: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of content.matchAll(CONSTANTS.INCLUDE_PATTERN)) {
    const slug = match[1];
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      ordered.push(slug);
    }
  }
  return ordered;
}

/**
 * Replaces every `{{>slug}}` in `content` with the resolved body for
 * that slug. Pure: the caller supplies the already-resolved bodies.
 */
export function applyIncludes(
  content: string,
  resolved: Readonly<Record<string, string>>,
): string {
  return content.replace(
    CONSTANTS.INCLUDE_PATTERN,
    (whole: string, slug: string) => resolved[slug] ?? whole,
  );
}
