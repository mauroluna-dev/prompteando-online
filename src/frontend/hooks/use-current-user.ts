import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { CurrentUserDTO } from "@/domain/user";

export function useCurrentUser() {
  return useSWR<CurrentUserDTO | null>("/api/me", fetcher);
}
