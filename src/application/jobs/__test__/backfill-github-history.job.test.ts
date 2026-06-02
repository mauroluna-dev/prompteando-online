import { describe, expect, mock, test } from "bun:test";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import {
  GitHubCommitGatewayError,
  type GitHubGateway,
} from "@/application/ports/github-gateway.port";
import type { Lock } from "@/application/ports/lock.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { GitHubConnection, RepoFullName } from "@/domain/github-connection";
import { PromptVersion, VersionNumber } from "@/domain/prompt-version";
import { BackfillGitHubHistoryJob } from "../backfill-github-history.job";

const fakeCrypto: CryptoPort = {
  randomUUID: () => "uuid",
  randomBytes: (n) => new Uint8Array(n),
  hashPassword: async (s) => s,
  verifyPassword: async () => true,
  encrypt: (plain) => `enc:${plain}`,
  decrypt: (ct) => ct.replace(/^enc:/, ""),
};

const NOW = new Date("2026-05-03T22:00:00Z");

function makeConn(overrides: Partial<{
  status: "pending" | "running" | "completed" | "failed" | null;
  total: number;
  processed: number;
}> = {}): GitHubConnection {
  const c = GitHubConnection.create(
    "u1",
    "octocat",
    "enc:gho_abc",
    ["repo"],
    RepoFullName.parse("octocat/prompteando-octocat"),
    "main",
    NOW,
  );
  if (overrides.status === "pending") {
    c.markBackfillPending(overrides.total ?? 0);
  } else if (overrides.status === "running") {
    c.markBackfillPending(overrides.total ?? 0);
    c.markBackfillRunning(NOW);
    for (let i = 0; i < (overrides.processed ?? 0); i++) {
      c.incrementBackfillProcessed();
    }
  } else if (overrides.status === "completed") {
    c.markBackfillPending(overrides.total ?? 0);
    c.markBackfillRunning(NOW);
    c.markBackfillCompleted(NOW);
  } else if (overrides.status === "failed") {
    c.markBackfillPending(overrides.total ?? 0);
    c.markBackfillFailed("token_invalid", NOW);
  }
  return c;
}

function makeVersion(
  id: string,
  num: number,
  createdAt: Date,
  msg: string | null = "Save",
): PromptVersion {
  return PromptVersion.create(
    id,
    "p1",
    VersionNumber.parse(num),
    "text",
    `body of v${num}\n`,
    msg,
    [],
    {},
    createdAt,
  );
}

function makeFakeGateway(
  commitImpl: GitHubGateway["commitVersionBackdated"],
): GitHubGateway {
  return {
    exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
    getAuthenticatedUser: mock(async () => ({ login: "" })),
    ensureRepo: mock(async () => ({
      fullName: "",
      defaultBranch: "main",
      wasCreated: false,
    })),
    ensureReadme: mock(async () => ({ committed: false })),
    commitVersion: mock(async () => ({ sha: "x" })),
    commitVersionBackdated: commitImpl,
  };
}

function makeFakeConnRepo(initialConn: GitHubConnection | null) {
  const repo: GitHubConnectionRepository & {
    saved: GitHubConnection[];
    updates: GitHubConnection[];
  } = {
    saved: [],
    updates: [],
    save: mock(async (c: GitHubConnection) => {
      repo.saved.push(c);
    }),
    findByUserId: mock(async () => initialConn),
    deleteByUserId: mock(async () => true),
    updateBackfillState: mock(async (c: GitHubConnection) => {
      repo.updates.push(c);
    }),
    findUnfinishedBackfills: mock(async () => []),
  };
  return repo;
}

function makeFakeVersionRepo(pendingQueue: Array<{
  version: PromptVersion;
  promptName: string;
  promptSlug: string;
}>) {
  const queue = [...pendingQueue];
  const repo: VersionRepository = {
    appendNewVersion: mock(async () => {}),
    findByPromptIdAndNumber: mock(async () => null),
    findCurrentForPrompt: mock(async () => null),
    findAllForPrompt: mock(async () => []),
    countForPrompt: mock(async () => 0),
    findById: mock(async () => null),
    markGithubCommit: mock(async () => {}),
    markGithubSyncFailed: mock(async () => {}),
    findOldestPendingForUser: mock(async () => queue.shift() ?? null),
    countPendingForUser: mock(async () => pendingQueue.length),
  };
  return repo;
}

function makeOkLock(): Lock {
  return {
    tryAcquire: mock(async () => "lock-token"),
    release: mock(async () => {}),
  };
}

describe("BackfillGitHubHistoryJob", () => {
  test("no connection → no work", async () => {
    const conn = makeFakeConnRepo(null);
    const versions = makeFakeVersionRepo([]);
    const gw = makeFakeGateway(mock(async () => ({ sha: "x" })));
    const lock = makeOkLock();
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });
    expect(conn.updates.length).toBe(0);
    expect(gw.commitVersionBackdated).not.toHaveBeenCalled();
  });

  test("status='completed', no force → no work", async () => {
    const conn = makeFakeConnRepo(makeConn({ status: "completed", total: 3 }));
    const versions = makeFakeVersionRepo([]);
    const gw = makeFakeGateway(mock(async () => ({ sha: "x" })));
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });
    expect(gw.commitVersionBackdated).not.toHaveBeenCalled();
    expect(conn.updates.length).toBe(0);
  });

  test("status='failed', no force → no work", async () => {
    const conn = makeFakeConnRepo(makeConn({ status: "failed" }));
    const gw = makeFakeGateway(mock(async () => ({ sha: "x" })));
    const job = new BackfillGitHubHistoryJob(
      conn, makeFakeVersionRepo([]), gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });
    expect(gw.commitVersionBackdated).not.toHaveBeenCalled();
  });

  test("status='running', no force → no work", async () => {
    const conn = makeFakeConnRepo(makeConn({ status: "running", total: 5, processed: 2 }));
    const gw = makeFakeGateway(mock(async () => ({ sha: "x" })));
    const job = new BackfillGitHubHistoryJob(
      conn, makeFakeVersionRepo([]), gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });
    expect(gw.commitVersionBackdated).not.toHaveBeenCalled();
  });

  test("empty (0 pending) → marks pending→running→completed, no commits", async () => {
    const conn = makeFakeConnRepo(makeConn({ status: null }));
    const versions = makeFakeVersionRepo([]);
    const gw = makeFakeGateway(mock(async () => ({ sha: "x" })));
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });
    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("completed");
    expect(last?.backfillTotal).toBe(0);
    expect(gw.commitVersionBackdated).not.toHaveBeenCalled();
  });

  test("happy path: 3 versions committed in order with correct args", async () => {
    const v1 = makeVersion("v1", 1, new Date("2026-05-01T10:00:00Z"), "first");
    const v2 = makeVersion("v2", 2, new Date("2026-05-02T10:00:00Z"), null);
    const v3 = makeVersion("v3", 3, new Date("2026-05-03T10:00:00Z"), "third");
    const versions = makeFakeVersionRepo([
      { version: v1, promptName: "My Prompt", promptSlug: "my-prompt" },
      { version: v2, promptName: "My Prompt", promptSlug: "my-prompt" },
      { version: v3, promptName: "My Prompt", promptSlug: "my-prompt" },
    ]);
    let nextSha = 1;
    const commitMock = mock<GitHubGateway["commitVersionBackdated"]>(
      async () => ({ sha: `sha${nextSha++}` }),
    );
    const gw = makeFakeGateway(commitMock);
    const conn = makeFakeConnRepo(makeConn({ status: null }));
    const lock = makeOkLock();
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });

    expect(commitMock).toHaveBeenCalledTimes(3);
    const args = commitMock.mock.calls.map((c) => c[0]);
    expect(args[0]?.accessToken).toBe("gho_abc");
    expect(args[0]?.repoFullName).toBe("octocat/prompteando-octocat");
    expect(args[0]?.path).toBe("prompts/my-prompt.md");
    expect(args[0]?.committedAt).toEqual(v1.createdAt);
    expect(args[0]?.authorName).toBe("octocat");
    expect(args[0]?.authorEmail).toBe("octocat@users.noreply.github.com");
    expect(args[0]?.commitMessage).toBe("My Prompt v1: first");
    expect(args[1]?.commitMessage).toBe("My Prompt v2: Save");
    expect(args[2]?.commitMessage).toBe("My Prompt v3: third");

    expect(versions.markGithubCommit).toHaveBeenCalledTimes(3);
    expect(lock.release).toHaveBeenCalledTimes(3);

    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("completed");
    expect(last?.backfillProcessed).toBe(3);
    expect(last?.backfillTotal).toBe(3);
  });

  test("fatal error in the middle aborts and marks failed", async () => {
    const v1 = makeVersion("v1", 1, new Date("2026-05-01T10:00:00Z"));
    const v2 = makeVersion("v2", 2, new Date("2026-05-02T10:00:00Z"));
    const v3 = makeVersion("v3", 3, new Date("2026-05-03T10:00:00Z"));
    const versions = makeFakeVersionRepo([
      { version: v1, promptName: "P", promptSlug: "p" },
      { version: v2, promptName: "P", promptSlug: "p" },
      { version: v3, promptName: "P", promptSlug: "p" },
    ]);
    let i = 0;
    const commitMock = mock(async () => {
      i++;
      if (i === 1) return { sha: "good" };
      throw new GitHubCommitGatewayError("token_invalid");
    });
    const gw = makeFakeGateway(commitMock);
    const conn = makeFakeConnRepo(makeConn({ status: null }));
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });

    expect(commitMock).toHaveBeenCalledTimes(2);
    expect(versions.markGithubSyncFailed).toHaveBeenCalledWith(
      "v2",
      "token_invalid",
    );
    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("failed");
    expect(last?.backfillFailureReason).toBe("token_invalid");
  });

  test("transient retry success counts a single commit", async () => {
    const v1 = makeVersion("v1", 1, NOW);
    const versions = makeFakeVersionRepo([
      { version: v1, promptName: "P", promptSlug: "p" },
    ]);
    let attempts = 0;
    const commitMock = mock(async () => {
      attempts++;
      if (attempts < 3) throw new GitHubCommitGatewayError("transient");
      return { sha: "ok" };
    });
    const gw = makeFakeGateway(commitMock);
    const conn = makeFakeConnRepo(makeConn({ status: null }));
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });

    expect(attempts).toBe(3);
    expect(versions.markGithubCommit).toHaveBeenCalledWith("v1", "ok");
    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("completed");
    expect(last?.backfillProcessed).toBe(1);
  });

  test("transient retry exhausted skips this version, continues loop", async () => {
    const v1 = makeVersion("v1", 1, NOW);
    const v2 = makeVersion("v2", 2, NOW);
    const versions = makeFakeVersionRepo([
      { version: v1, promptName: "P", promptSlug: "p" },
      { version: v2, promptName: "P", promptSlug: "p" },
    ]);
    let calls = 0;
    const commitMock = mock(async () => {
      calls++;
      if (calls <= 3) throw new GitHubCommitGatewayError("transient");
      return { sha: "ok-v2" };
    });
    const gw = makeFakeGateway(commitMock);
    const conn = makeFakeConnRepo(makeConn({ status: null }));
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1" });

    expect(versions.markGithubSyncFailed).toHaveBeenCalledWith("v1", "transient");
    expect(versions.markGithubCommit).toHaveBeenCalledWith("v2", "ok-v2");
    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("completed");
    // processed only counts true successes (v2), not skipped v1.
    expect(last?.backfillProcessed).toBe(1);
  });

  test("lock timeout marks lock_timeout, never calls gateway, continues loop", async () => {
    const v1 = makeVersion("v1", 1, NOW);
    const versions = makeFakeVersionRepo([
      { version: v1, promptName: "P", promptSlug: "p1" },
    ]);
    const lock: Lock = {
      tryAcquire: mock(async () => null),
      release: mock(async () => {}),
    };
    let now = 0;
    const clock = {
      now: () => {
        now += 1;
        return new Date(now);
      },
    };
    const commitMock = mock<GitHubGateway["commitVersionBackdated"]>(
      async () => ({ sha: "ok" }),
    );
    const gw = makeFakeGateway(commitMock);
    const conn = makeFakeConnRepo(makeConn({ status: null }));
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, lock,
      {
        backoffsMs: [0, 0, 0],
        clock,
        sleep: async () => {
          now += 1_000_000;
        },
      },
    );
    await job.run({ userId: "u1" });

    expect(versions.markGithubSyncFailed).toHaveBeenCalledWith(
      "v1",
      "lock_timeout",
    );
    expect(commitMock).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
    // backfill itself completes (lock_timeout is per-version, not fatal).
    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("completed");
    expect(last?.backfillProcessed).toBe(0);
  });

  test("force=true on running connection resumes without resetting counters", async () => {
    const v1 = makeVersion("v1", 1, NOW);
    const versions = makeFakeVersionRepo([
      { version: v1, promptName: "P", promptSlug: "p" },
    ]);
    const initial = makeConn({ status: "running", total: 10, processed: 4 });
    const conn = makeFakeConnRepo(initial);
    const commitMock = mock(async () => ({ sha: "ok" }));
    const gw = makeFakeGateway(commitMock);
    const job = new BackfillGitHubHistoryJob(
      conn, versions, gw, fakeCrypto, makeOkLock(),
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );
    await job.run({ userId: "u1", force: true });

    expect(commitMock).toHaveBeenCalledTimes(1);
    // total stays at the prior value, processed advances by 1.
    const last = conn.updates[conn.updates.length - 1];
    expect(last?.backfillStatus).toBe("completed");
    expect(last?.backfillTotal).toBe(10);
    expect(last?.backfillProcessed).toBe(5);
  });
});
