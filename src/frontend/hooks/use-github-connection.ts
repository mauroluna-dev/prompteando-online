import useSWR from "swr";
import type { GitHubConnectionView } from "@/domain/github-connection";
import { getGithubConnection } from "@/frontend/lib/api/integrations";

export function useGithubConnection() {
  return useSWR<GitHubConnectionView | null>(
    "/api/integrations/github",
    getGithubConnection,
  );
}
