import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { UserDTO } from "@/domain/user";

export function useCurrentUser() {
  return useSWR<UserDTO | null>("/api/me", fetcher);
}
