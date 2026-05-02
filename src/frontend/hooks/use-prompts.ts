import useSWR from "swr";
import type { Prompt } from "@/domain/prompt";
import { getPrompt, listPrompts } from "@/frontend/lib/api/prompts";

export function usePrompts() {
  return useSWR<Prompt[]>("/api/prompts", listPrompts);
}

export function usePrompt(slug: string | undefined) {
  return useSWR<Prompt | null>(
    slug ? `/api/prompts/${slug}` : null,
    () => (slug ? getPrompt(slug) : null),
  );
}
