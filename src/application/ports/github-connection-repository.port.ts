import type { GitHubConnection } from "@/domain/github-connection";

export interface GitHubConnectionRepository {
  save(connection: GitHubConnection): Promise<void>;
  findByUserId(userId: string): Promise<GitHubConnection | null>;
  deleteByUserId(userId: string): Promise<boolean>;
  /**
   * Persist only the backfill_* fields of `connection` for the row
   * matching its userId. Leaves connectedAt, encryptedAccessToken,
   * etc. untouched.
   */
  updateBackfillState(connection: GitHubConnection): Promise<void>;
  /**
   * Connections in 'pending' or 'running' state. Used by the boot
   * reconciler to resume backfills interrupted by a crash.
   */
  findUnfinishedBackfills(): Promise<GitHubConnection[]>;
}
