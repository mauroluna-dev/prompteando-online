import useSWR from "swr";
import { type LabelEntry, listLabels } from "@/frontend/lib/api/labels";

export function useLabels(slug: string | undefined) {
  return useSWR<LabelEntry[]>(
    slug ? `/api/prompts/${slug}/labels` : null,
    () => (slug ? listLabels(slug) : []),
  );
}
