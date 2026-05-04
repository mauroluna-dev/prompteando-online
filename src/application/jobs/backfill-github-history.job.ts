import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import {
  GitHubCommitGatewayError,
  type GitHubGateway,
} from "@/application/ports/github-gateway.port";
import type { Lock } from "@/application/ports/lock.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  CONSTANTS as GH_CONSTANTS,
  type GitHubConnection,
} from "@/domain/github-connection";
import type { PromptVersion } from "@/domain/prompt-version";
import { CONSTANTS as VERSION_CONSTANTS } from "@/domain/prompt-version/constants";
import { renderVersionContentRaw } from "./render-version-content";

export type BackfillGitHubHistoryJobInput = {
  userId: string;
  /**
   * If true, the job runs even when status is already 'running'
   * (used by the boot reconciler to resume after a crash). Default
   * false (a fresh trigger that finds an in-flight backfill is a
   * no-op — another worker is processing it).
   */
  force?: boolean;
};

type Clock = { now(): Date };
type Sleep = (ms: number) => Promise<void>;
type PendingItem = {
  version: PromptVersion;
  promptName: string;
  promptSlug: string;
};

const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const defaultClock: Clock = { now: () => new Date() };

export class BackfillGitHubHistoryJob {
  private readonly backoffsMs: readonly number[];
  private readonly clock: Clock;
  private readonly sleep: Sleep;

  constructor(
    private readonly connRepo: GitHubConnectionRepository,
    private readonly versionRepo: VersionRepository,
    private readonly gateway: GitHubGateway,
    private readonly crypto: CryptoPort,
    private readonly lock: Lock,
    options: {
      backoffsMs?: readonly number[];
      clock?: Clock;
      sleep?: Sleep;
    } = {},
  ) {
    this.backoffsMs =
      options.backoffsMs ?? VERSION_CONSTANTS.GITHUB_RETRY_BACKOFFS_MS;
    this.clock = options.clock ?? defaultClock;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async run(input: BackfillGitHubHistoryJobInput): Promise<void> {
    const force = input.force ?? false;
    const conn = await this.connRepo.findByUserId(input.userId);
    if (!conn) return;

    const status = conn.backfillStatus;
    if (status === "completed" || status === "failed") return;
    if (status === "running" && !force) return;

    if (status === null) {
      const total = await this.versionRepo.countPendingForUser(input.userId);
      if (total === 0) {
        // Trivial case: connect with no prior history. Mark
        // pending → running → completed so the UI never sees null
        // forever, but skip the loop entirely.
        conn.markBackfillPending(0);
        await this.connRepo.updateBackfillState(conn);
        conn.markBackfillRunning(this.clock.now());
        await this.connRepo.updateBackfillState(conn);
        conn.markBackfillCompleted(this.clock.now());
        await this.connRepo.updateBackfillState(conn);
        return;
      }
      conn.markBackfillPending(total);
      await this.connRepo.updateBackfillState(conn);
      conn.markBackfillRunning(this.clock.now());
      await this.connRepo.updateBackfillState(conn);
    }
    // status === 'pending' (rare: crash between markPending and
    // markRunning) or 'running' (force=true reconciler) → continue
    // without resetting counters.
    if (status === "pending") {
      conn.markBackfillRunning(this.clock.now());
      await this.connRepo.updateBackfillState(conn);
    }

    const accessToken = this.crypto.decrypt(conn.encryptedAccessToken);
    const authorName = conn.githubLogin;
    const authorEmail = `${conn.githubLogin}@${GH_CONSTANTS.BACKFILL_AUTHOR_EMAIL_DOMAIN}`;

    while (true) {
      const next = await this.versionRepo.findOldestPendingForUser(
        input.userId,
      );
      if (!next) break;
      const ok = await this.processOne(
        conn,
        next,
        accessToken,
        authorName,
        authorEmail,
      );
      if (!ok) return;
    }

    conn.markBackfillCompleted(this.clock.now());
    await this.connRepo.updateBackfillState(conn);
  }

  /**
   * Process one pending version. Returns false ONLY on a fatal
   * connection-level error (token/scope/repo) — caller must abort
   * the whole backfill. Returns true for success, lock_timeout,
   * and exhausted transient retries (skip and continue).
   */
  private async processOne(
    conn: GitHubConnection,
    next: PendingItem,
    accessToken: string,
    authorName: string,
    authorEmail: string,
  ): Promise<boolean> {
    const lockKey = `gh:commit:${conn.userId}:${next.promptSlug}`;
    const token = await this.acquireWithPoll(lockKey);
    if (!token) {
      await this.versionRepo.markGithubSyncFailed(
        next.version.id,
        "lock_timeout",
      );
      return true;
    }

    try {
      const path = `${VERSION_CONSTANTS.GITHUB_COMMIT_PATH_PREFIX}/${next.promptSlug}${VERSION_CONSTANTS.GITHUB_COMMIT_PATH_EXT}`;
      const content = renderVersionContentRaw(
        next.promptName,
        next.promptSlug,
        next.version,
      );
      const commitMessage = `${next.promptName} v${next.version.versionNumber.value}: ${next.version.commitMessage ?? "Save"}`;

      for (let attempt = 0; attempt < this.backoffsMs.length; attempt++) {
        try {
          const { sha } = await this.gateway.commitVersionBackdated({
            accessToken,
            repoFullName: conn.repoFullName.value,
            branch: conn.defaultBranch,
            path,
            content,
            commitMessage,
            committedAt: next.version.createdAt,
            authorName,
            authorEmail,
          });
          await this.versionRepo.markGithubCommit(next.version.id, sha);
          conn.incrementBackfillProcessed();
          await this.connRepo.updateBackfillState(conn);
          return true;
        } catch (err) {
          const code =
            err instanceof GitHubCommitGatewayError ? err.code : "unknown";
          const isFatal = (
            GH_CONSTANTS.BACKFILL_FATAL_ERRORS as readonly string[]
          ).includes(code);
          if (isFatal) {
            await this.versionRepo.markGithubSyncFailed(next.version.id, code);
            conn.markBackfillFailed(code, this.clock.now());
            await this.connRepo.updateBackfillState(conn);
            return false;
          }
          const isLast = attempt === this.backoffsMs.length - 1;
          if (isLast) {
            await this.versionRepo.markGithubSyncFailed(next.version.id, code);
            return true;
          }
          await this.sleep(this.backoffsMs[attempt] ?? 0);
        }
      }
      return true;
    } finally {
      await this.lock.release(lockKey, token);
    }
  }

  private async acquireWithPoll(key: string): Promise<string | null> {
    const deadline =
      this.clock.now().getTime() +
      VERSION_CONSTANTS.GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS;
    while (this.clock.now().getTime() < deadline) {
      const token = await this.lock.tryAcquire(
        key,
        VERSION_CONSTANTS.GITHUB_LOCK_TTL_MS,
      );
      if (token) return token;
      await this.sleep(VERSION_CONSTANTS.GITHUB_LOCK_ACQUIRE_POLL_MS);
    }
    return null;
  }
}
