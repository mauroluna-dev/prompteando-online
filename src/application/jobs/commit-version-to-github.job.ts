import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import {
  GitHubCommitGatewayError,
  type GitHubGateway,
} from "@/application/ports/github-gateway.port";
import type { Lock } from "@/application/ports/lock.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { CONSTANTS } from "@/domain/prompt-version/constants";
import { renderVersionContent } from "./render-version-content";

export type CommitVersionToGitHubJobInput = {
  userId: string;
  promptId: string;
  versionId: string;
};

type Clock = { now(): Date };
type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const defaultClock: Clock = { now: () => new Date() };

export class CommitVersionToGitHubJob {
  private readonly backoffsMs: readonly number[];
  private readonly clock: Clock;
  private readonly sleep: Sleep;

  constructor(
    private readonly connRepo: GitHubConnectionRepository,
    private readonly promptRepo: PromptRepository,
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
    this.backoffsMs = options.backoffsMs ?? CONSTANTS.GITHUB_RETRY_BACKOFFS_MS;
    this.clock = options.clock ?? defaultClock;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async run(input: CommitVersionToGitHubJobInput): Promise<void> {
    const conn = await this.connRepo.findByUserId(input.userId);
    if (!conn) return;

    const [prompt, version] = await Promise.all([
      this.promptRepo.findById(input.promptId),
      this.versionRepo.findById(input.versionId),
    ]);
    if (!prompt || !version) return;

    const lockKey = `gh:commit:${input.userId}:${prompt.slug.value}`;
    const lockToken = await this.acquireWithPoll(lockKey);
    if (!lockToken) {
      await this.versionRepo.markGithubSyncFailed(input.versionId, "lock_timeout");
      return;
    }

    try {
      const accessToken = this.crypto.decrypt(conn.encryptedAccessToken);
      const path = `${CONSTANTS.GITHUB_COMMIT_PATH_PREFIX}/${prompt.slug.value}${CONSTANTS.GITHUB_COMMIT_PATH_EXT}`;
      const content = renderVersionContent(prompt, version);
      const commitMessage = `${prompt.name.value} v${version.versionNumber.value}: ${version.commitMessage ?? "Save"}`;

      for (let attempt = 0; attempt < this.backoffsMs.length; attempt++) {
        try {
          const { sha } = await this.gateway.commitVersion({
            accessToken,
            repoFullName: conn.repoFullName.value,
            branch: conn.defaultBranch,
            path,
            content,
            commitMessage,
          });
          await this.versionRepo.markGithubCommit(input.versionId, sha);
          return;
        } catch (err) {
          const code =
            err instanceof GitHubCommitGatewayError ? err.code : "unknown";
          const isNonRetryable = (
            CONSTANTS.NON_RETRYABLE_ERRORS as readonly string[]
          ).includes(code);
          const isLast = attempt === this.backoffsMs.length - 1;
          if (isNonRetryable || isLast) {
            await this.versionRepo.markGithubSyncFailed(input.versionId, code);
            return;
          }
          const backoff = this.backoffsMs[attempt] ?? 0;
          await this.sleep(backoff);
        }
      }
    } finally {
      await this.lock.release(lockKey, lockToken);
    }
  }

  private async acquireWithPoll(key: string): Promise<string | null> {
    const deadline =
      this.clock.now().getTime() + CONSTANTS.GITHUB_LOCK_ACQUIRE_MAX_WAIT_MS;
    while (this.clock.now().getTime() < deadline) {
      const token = await this.lock.tryAcquire(
        key,
        CONSTANTS.GITHUB_LOCK_TTL_MS,
      );
      if (token) return token;
      await this.sleep(CONSTANTS.GITHUB_LOCK_ACQUIRE_POLL_MS);
    }
    return null;
  }
}
