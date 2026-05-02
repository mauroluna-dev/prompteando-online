import useSWR from "swr";
import type { ApiKeyView } from "@/domain/api-key";
import { listApiKeys } from "@/frontend/lib/api/api-keys";

export function useApiKeys() {
  return useSWR<ApiKeyView[]>("/api/keys", listApiKeys);
}
