import useSWR from "swr";
import type { GitHubConnectionView } from "@/domain/github-connection";
import { getGithubConnection } from "@/frontend/lib/api/integrations";

const POLL_MS = 2_000;

export function useGithubConnection() {
  return useSWR<GitHubConnectionView | null>(
    "/api/integrations/github",
    getGithubConnection,
    {
      // Poll while a backfill is in flight so the progress bar moves
      // without manual refresh. Stops automatically on completed/failed.
      refreshInterval: (data) => {
        const status = data?.backfillStatus;
        return status === "pending" || status === "running" ? POLL_MS : 0;
      },
    },
  );
}
