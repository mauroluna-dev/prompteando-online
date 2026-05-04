import { BackfillStateTransitionError } from "./github-connection.errors";
import { RepoFullName } from "./repo-full-name.vo";

export type BackfillStatus = "pending" | "running" | "completed" | "failed";

export type GitHubConnectionRow = {
  userId: string;
  githubLogin: string;
  encryptedAccessToken: string;
  scopes: string[];
  repoFullName: string;
  defaultBranch: string;
  connectedAt: Date;
  backfillStatus: string | null;
  backfillTotal: number | null;
  backfillProcessed: number | null;
  backfillStartedAt: Date | null;
  backfillFinishedAt: Date | null;
  backfillFailureReason: string | null;
};

export type GitHubConnectionView = {
  userId: string;
  githubLogin: string;
  repoFullName: string;
  defaultBranch: string;
  connectedAt: Date;
  backfillStatus: BackfillStatus | null;
  backfillTotal: number | null;
  backfillProcessed: number | null;
  backfillStartedAt: Date | null;
  backfillFinishedAt: Date | null;
  backfillFailureReason: string | null;
};

export class GitHubConnection {
  private constructor(
    readonly userId: string,
    readonly githubLogin: string,
    readonly encryptedAccessToken: string,
    readonly scopes: readonly string[],
    readonly repoFullName: RepoFullName,
    readonly defaultBranch: string,
    readonly connectedAt: Date,
    private _backfillStatus: BackfillStatus | null,
    private _backfillTotal: number | null,
    private _backfillProcessed: number | null,
    private _backfillStartedAt: Date | null,
    private _backfillFinishedAt: Date | null,
    private _backfillFailureReason: string | null,
  ) {}

  static create(
    userId: string,
    githubLogin: string,
    encryptedAccessToken: string,
    scopes: readonly string[],
    repoFullName: RepoFullName,
    defaultBranch: string,
    now: Date,
  ): GitHubConnection {
    return new GitHubConnection(
      userId,
      githubLogin,
      encryptedAccessToken,
      scopes,
      repoFullName,
      defaultBranch,
      now,
      null,
      null,
      null,
      null,
      null,
      null,
    );
  }

  static fromRow(row: GitHubConnectionRow): GitHubConnection {
    return new GitHubConnection(
      row.userId,
      row.githubLogin,
      row.encryptedAccessToken,
      row.scopes,
      RepoFullName.parse(row.repoFullName),
      row.defaultBranch,
      row.connectedAt,
      normalizeBackfillStatus(row.backfillStatus),
      row.backfillTotal,
      row.backfillProcessed,
      row.backfillStartedAt,
      row.backfillFinishedAt,
      row.backfillFailureReason,
    );
  }

  get backfillStatus(): BackfillStatus | null {
    return this._backfillStatus;
  }

  get backfillTotal(): number | null {
    return this._backfillTotal;
  }

  get backfillProcessed(): number | null {
    return this._backfillProcessed;
  }

  get backfillStartedAt(): Date | null {
    return this._backfillStartedAt;
  }

  get backfillFinishedAt(): Date | null {
    return this._backfillFinishedAt;
  }

  get backfillFailureReason(): string | null {
    return this._backfillFailureReason;
  }

  markBackfillPending(total: number): void {
    const allowed: (BackfillStatus | null)[] = [null, "completed", "failed"];
    if (!allowed.includes(this._backfillStatus)) {
      throw new BackfillStateTransitionError(this._backfillStatus, "pending");
    }
    this._backfillStatus = "pending";
    this._backfillTotal = total;
    this._backfillProcessed = 0;
    this._backfillStartedAt = null;
    this._backfillFinishedAt = null;
    this._backfillFailureReason = null;
  }

  markBackfillRunning(now: Date): void {
    if (this._backfillStatus !== "pending") {
      throw new BackfillStateTransitionError(this._backfillStatus, "running");
    }
    this._backfillStatus = "running";
    this._backfillStartedAt = now;
  }

  incrementBackfillProcessed(): void {
    if (this._backfillStatus !== "running") {
      throw new BackfillStateTransitionError(
        this._backfillStatus,
        "running(+processed)",
      );
    }
    this._backfillProcessed = (this._backfillProcessed ?? 0) + 1;
  }

  markBackfillCompleted(now: Date): void {
    if (this._backfillStatus !== "running") {
      throw new BackfillStateTransitionError(this._backfillStatus, "completed");
    }
    this._backfillStatus = "completed";
    this._backfillFinishedAt = now;
    this._backfillFailureReason = null;
  }

  markBackfillFailed(reason: string, now: Date): void {
    const allowed: (BackfillStatus | null)[] = ["pending", "running"];
    if (!allowed.includes(this._backfillStatus)) {
      throw new BackfillStateTransitionError(this._backfillStatus, "failed");
    }
    this._backfillStatus = "failed";
    this._backfillFinishedAt = now;
    this._backfillFailureReason = reason;
  }

  toView(): GitHubConnectionView {
    return {
      userId: this.userId,
      githubLogin: this.githubLogin,
      repoFullName: this.repoFullName.value,
      defaultBranch: this.defaultBranch,
      connectedAt: this.connectedAt,
      backfillStatus: this._backfillStatus,
      backfillTotal: this._backfillTotal,
      backfillProcessed: this._backfillProcessed,
      backfillStartedAt: this._backfillStartedAt,
      backfillFinishedAt: this._backfillFinishedAt,
      backfillFailureReason: this._backfillFailureReason,
    };
  }

  toJSON(): GitHubConnectionView {
    return this.toView();
  }
}

const VALID_STATUSES: readonly BackfillStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
];

function normalizeBackfillStatus(value: string | null): BackfillStatus | null {
  if (value === null) return null;
  return (VALID_STATUSES as readonly string[]).includes(value)
    ? (value as BackfillStatus)
    : null;
}
