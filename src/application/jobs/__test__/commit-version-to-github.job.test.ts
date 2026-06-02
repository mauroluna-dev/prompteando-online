import { describe, expect, mock, test } from "bun:test";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import {
  GitHubCommitGatewayError,
  type GitHubGateway,
} from "@/application/ports/github-gateway.port";
import type { Lock } from "@/application/ports/lock.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { GitHubConnection } from "@/domain/github-connection";
import { RepoFullName } from "@/domain/github-connection/repo-full-name.vo";
import { Prompt, PromptName, Slug } from "@/domain/prompt";
import { PromptVersion, VersionNumber } from "@/domain/prompt-version";
import { CommitVersionToGitHubJob } from "../commit-version-to-github.job";

const fakeCrypto: CryptoPort = {
  randomUUID: () => "uuid",
  randomBytes: (n) => new Uint8Array(n),
  hashPassword: async (s) => s,
  verifyPassword: async () => true,
  encrypt: (plain) => `enc:${plain}`,
  decrypt: (ct) => ct.replace(/^enc:/, ""),
};

function makeConn(): GitHubConnection {
  return GitHubConnection.create(
    "u1",
    "octocat",
    "enc:gho_abc",
    ["repo"],
    RepoFullName.parse("octocat/prompteando-octocat"),
    "main",
    new Date("2026-05-03T10:00:00Z"),
  );
}

function makePrompt(): Prompt {
  return Prompt.create(
    "p1",
    "u1",
    PromptName.parse("My Prompt"),
    Slug.parse("my-prompt"),
    null,
    new Date("2026-05-03T10:00:00Z"),
  );
}

function makeVersion(): PromptVersion {
  return PromptVersion.create(
    "v1",
    "p1",
    VersionNumber.parse(2),
    "hello\n",
    "Tweak",
    [],
    new Date("2026-05-03T20:30:00Z"),
  );
}

function makeFakeRepos(opts: {
  conn?: GitHubConnection | null;
  prompt?: Prompt | null;
  version?: PromptVersion | null;
}) {
  const connRepo = {
    findByUserId: mock(async () => opts.conn ?? null),
    save: mock(async () => {}),
    deleteByUserId: mock(async () => true),
    updateBackfillState: mock(async () => {}),
    findUnfinishedBackfills: mock(async () => []),
  } satisfies GitHubConnectionRepository;

  const promptRepo: PromptRepository = {
    save: mock(async () => {}),
    findById: mock(async () => opts.prompt ?? null),
    findBySlug: mock(async () => null),
    findAllByUserId: mock(async () => []),
    delete: mock(async () => false),
    findNextAvailableSlug: mock(async (_u: string, s: Slug) => s),
  };

  const versionRepo: VersionRepository = {
    appendNewVersion: mock(async () => {}),
    findByPromptIdAndNumber: mock(async () => null),
    findCurrentForPrompt: mock(async () => null),
    findAllForPrompt: mock(async () => []),
    countForPrompt: mock(async () => 0),
    findById: mock(async () => opts.version ?? null),
    markGithubCommit: mock(async () => {}),
    markGithubSyncFailed: mock(async () => {}),
    findOldestPendingForUser: mock(async () => null),
    countPendingForUser: mock(async () => 0),
  };

  return { connRepo, promptRepo, versionRepo };
}

function makeFakeLock(behavior: "ok" | "always_fail" = "ok"): Lock {
  return {
    tryAcquire: mock(async () =>
      behavior === "ok" ? "lock-token" : null,
    ),
    release: mock(async () => {}),
  };
}

describe("CommitVersionToGitHubJob", () => {
  test("no connection → no work, no DB writes", async () => {
    const repos = makeFakeRepos({ conn: null });
    const gateway: GitHubGateway = {
      exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
      getAuthenticatedUser: mock(async () => ({ login: "" })),
      ensureRepo: mock(async () => ({ fullName: "", defaultBranch: "main", wasCreated: false })),
      ensureReadme: mock(async () => ({ committed: false })),
      commitVersion: mock(async () => ({ sha: "x" })),
      commitVersionBackdated: mock(async () => ({ sha: "x" })),
    };
    const lock = makeFakeLock();

    const job = new CommitVersionToGitHubJob(
      repos.connRepo, repos.promptRepo, repos.versionRepo,
      gateway, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );

    await job.run({ userId: "u1", promptId: "p1", versionId: "v1" });

    expect(gateway.commitVersion).not.toHaveBeenCalled();
    expect(repos.versionRepo.markGithubCommit).not.toHaveBeenCalled();
    expect(repos.versionRepo.markGithubSyncFailed).not.toHaveBeenCalled();
    expect(lock.tryAcquire).not.toHaveBeenCalled();
  });

  test("happy path → commits, marks sha, releases lock", async () => {
    const repos = makeFakeRepos({
      conn: makeConn(),
      prompt: makePrompt(),
      version: makeVersion(),
    });
    const commitVersion = mock<GitHubGateway["commitVersion"]>(
      async () => ({ sha: "deadbeef" }),
    );
    const gateway: GitHubGateway = {
      exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
      getAuthenticatedUser: mock(async () => ({ login: "" })),
      ensureRepo: mock(async () => ({ fullName: "", defaultBranch: "main", wasCreated: false })),
      ensureReadme: mock(async () => ({ committed: false })),
      commitVersion,
      commitVersionBackdated: mock(async () => ({ sha: "x" })),
    };
    const lock = makeFakeLock();

    const job = new CommitVersionToGitHubJob(
      repos.connRepo, repos.promptRepo, repos.versionRepo,
      gateway, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );

    await job.run({ userId: "u1", promptId: "p1", versionId: "v1" });

    expect(commitVersion).toHaveBeenCalledTimes(1);
    const arg = commitVersion.mock.calls[0]?.[0];
    if (!arg) throw new Error("commitVersion was not called");
    expect(arg.accessToken).toBe("gho_abc");
    expect(arg.repoFullName).toBe("octocat/prompteando-octocat");
    expect(arg.branch).toBe("main");
    expect(arg.path).toBe("prompts/my-prompt.md");
    expect(arg.commitMessage).toBe("My Prompt v2: Tweak");
    expect(arg.content.startsWith("---\n")).toBe(true);

    expect(repos.versionRepo.markGithubCommit).toHaveBeenCalledTimes(1);
    expect(repos.versionRepo.markGithubCommit).toHaveBeenCalledWith("v1", "deadbeef");
    expect(repos.versionRepo.markGithubSyncFailed).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledWith("gh:commit:u1:my-prompt", "lock-token");
  });

  test("transient × 2 then success → marks sha once, no failure write", async () => {
    const repos = makeFakeRepos({
      conn: makeConn(),
      prompt: makePrompt(),
      version: makeVersion(),
    });
    let calls = 0;
    const gateway: GitHubGateway = {
      exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
      getAuthenticatedUser: mock(async () => ({ login: "" })),
      ensureRepo: mock(async () => ({ fullName: "", defaultBranch: "main", wasCreated: false })),
      ensureReadme: mock(async () => ({ committed: false })),
      commitVersionBackdated: mock(async () => ({ sha: "x" })),
      commitVersion: mock(async () => {
        calls++;
        if (calls < 3) throw new GitHubCommitGatewayError("transient");
        return { sha: "ok" };
      }),
    };
    const lock = makeFakeLock();

    const job = new CommitVersionToGitHubJob(
      repos.connRepo, repos.promptRepo, repos.versionRepo,
      gateway, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );

    await job.run({ userId: "u1", promptId: "p1", versionId: "v1" });

    expect(calls).toBe(3);
    expect(repos.versionRepo.markGithubCommit).toHaveBeenCalledWith("v1", "ok");
    expect(repos.versionRepo.markGithubSyncFailed).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  test("3 transient failures → markGithubSyncFailed('transient')", async () => {
    const repos = makeFakeRepos({
      conn: makeConn(),
      prompt: makePrompt(),
      version: makeVersion(),
    });
    const gateway: GitHubGateway = {
      exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
      getAuthenticatedUser: mock(async () => ({ login: "" })),
      ensureRepo: mock(async () => ({ fullName: "", defaultBranch: "main", wasCreated: false })),
      ensureReadme: mock(async () => ({ committed: false })),
      commitVersionBackdated: mock(async () => ({ sha: "x" })),
      commitVersion: mock(async () => {
        throw new GitHubCommitGatewayError("transient");
      }),
    };
    const lock = makeFakeLock();

    const job = new CommitVersionToGitHubJob(
      repos.connRepo, repos.promptRepo, repos.versionRepo,
      gateway, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );

    await job.run({ userId: "u1", promptId: "p1", versionId: "v1" });

    expect(gateway.commitVersion).toHaveBeenCalledTimes(3);
    expect(repos.versionRepo.markGithubSyncFailed).toHaveBeenCalledWith("v1", "transient");
    expect(repos.versionRepo.markGithubCommit).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalled();
  });

  test("non-retryable (token_invalid) → single attempt, marks failure, no retry", async () => {
    const repos = makeFakeRepos({
      conn: makeConn(),
      prompt: makePrompt(),
      version: makeVersion(),
    });
    const gateway: GitHubGateway = {
      exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
      getAuthenticatedUser: mock(async () => ({ login: "" })),
      ensureRepo: mock(async () => ({ fullName: "", defaultBranch: "main", wasCreated: false })),
      ensureReadme: mock(async () => ({ committed: false })),
      commitVersionBackdated: mock(async () => ({ sha: "x" })),
      commitVersion: mock(async () => {
        throw new GitHubCommitGatewayError("token_invalid");
      }),
    };
    const lock = makeFakeLock();

    const job = new CommitVersionToGitHubJob(
      repos.connRepo, repos.promptRepo, repos.versionRepo,
      gateway, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {} },
    );

    await job.run({ userId: "u1", promptId: "p1", versionId: "v1" });

    expect(gateway.commitVersion).toHaveBeenCalledTimes(1);
    expect(repos.versionRepo.markGithubSyncFailed).toHaveBeenCalledWith("v1", "token_invalid");
    expect(lock.release).toHaveBeenCalled();
  });

  test("lock unobtainable → marks lock_timeout, never calls gateway", async () => {
    const repos = makeFakeRepos({
      conn: makeConn(),
      prompt: makePrompt(),
      version: makeVersion(),
    });
    const gateway: GitHubGateway = {
      exchangeCodeForToken: mock(async () => ({ accessToken: "", scopes: [] })),
      getAuthenticatedUser: mock(async () => ({ login: "" })),
      ensureRepo: mock(async () => ({ fullName: "", defaultBranch: "main", wasCreated: false })),
      ensureReadme: mock(async () => ({ committed: false })),
      commitVersion: mock(async () => ({ sha: "x" })),
      commitVersionBackdated: mock(async () => ({ sha: "x" })),
    };
    const lock = makeFakeLock("always_fail");
    // Fast-forward clock so the deadline is reached after one poll.
    let calls = 0;
    const clock = {
      now: () => {
        calls++;
        return new Date(calls === 1 ? 0 : 1_000_000);
      },
    };

    const job = new CommitVersionToGitHubJob(
      repos.connRepo, repos.promptRepo, repos.versionRepo,
      gateway, fakeCrypto, lock,
      { backoffsMs: [0, 0, 0], sleep: async () => {}, clock },
    );

    await job.run({ userId: "u1", promptId: "p1", versionId: "v1" });

    expect(gateway.commitVersion).not.toHaveBeenCalled();
    expect(repos.versionRepo.markGithubSyncFailed).toHaveBeenCalledWith("v1", "lock_timeout");
    expect(lock.release).not.toHaveBeenCalled();
  });
});
