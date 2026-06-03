import { describe, expect, test } from "bun:test";
import { ConnectGitHubWithTokenCommand } from "@/application/commands/connect-github-with-token.command";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import type {
  GitHubGateway,
  GitHubRepoAccessResult,
} from "@/application/ports/github-gateway.port";
import {
  GitHubRepoAccessDeniedError,
  GitHubRepoWriteDeniedError,
  GitHubTokenInvalidError,
  InvalidRepoFullNameError,
  type GitHubConnection,
} from "@/domain/github-connection";

class FakeRepo implements GitHubConnectionRepository {
  saveCalls: GitHubConnection[] = [];
  async save(connection: GitHubConnection): Promise<void> {
    this.saveCalls.push(connection);
  }
  async findByUserId(): Promise<GitHubConnection | null> {
    return null;
  }
  async deleteByUserId(): Promise<boolean> {
    return true;
  }
  async updateBackfillState(): Promise<void> {}
  async findUnfinishedBackfills(): Promise<GitHubConnection[]> {
    return [];
  }
}

/** Gateway stub: only the two methods the PAT command exercises. */
function makeGateway(opts: {
  verify: () => Promise<GitHubRepoAccessResult>;
  login?: string;
}): GitHubGateway {
  const notUsed = () => {
    throw new Error("not exercised in PAT command");
  };
  return {
    exchangeCodeForToken: notUsed as never,
    getAuthenticatedUser: async () => ({ login: opts.login ?? "octocat" }),
    verifyRepoAccess: opts.verify,
    ensureRepo: notUsed as never,
    ensureReadme: notUsed as never,
    commitVersion: notUsed as never,
    commitVersionBackdated: notUsed as never,
  };
}

const fakeCrypto: CryptoPort = {
  randomUUID: () => "fake-uuid",
  randomBytes: (n) => new Uint8Array(n),
  hashPassword: async (s) => s,
  verifyPassword: async () => true,
  encrypt: (plain) => `enc:${plain}`,
  decrypt: (ct) => ct.replace(/^enc:/, ""),
};

describe("ConnectGitHubWithTokenCommand", () => {
  test("happy path persists a pat connection with encrypted token", async () => {
    const repo = new FakeRepo();
    const gateway = makeGateway({
      login: "octocat",
      verify: async () => ({ defaultBranch: "develop", canWrite: true }),
    });
    const cmd = new ConnectGitHubWithTokenCommand(repo, gateway, fakeCrypto);

    const result = await cmd.execute(
      "user-1",
      "github_pat_abc",
      "octocat/mis-prompts",
    );

    expect(result.connectionMethod).toBe("pat");
    expect(result.userId).toBe("user-1");
    expect(result.githubLogin).toBe("octocat");
    expect(result.encryptedAccessToken).toBe("enc:github_pat_abc");
    expect(result.scopes).toEqual([]);
    expect(result.repoFullName.value).toBe("octocat/mis-prompts");
    expect(result.defaultBranch).toBe("develop");
    expect(repo.saveCalls.length).toBe(1);
  });

  test("token without write access throws GitHubRepoWriteDeniedError and never saves", async () => {
    const repo = new FakeRepo();
    const gateway = makeGateway({
      verify: async () => ({ defaultBranch: "main", canWrite: false }),
    });
    const cmd = new ConnectGitHubWithTokenCommand(repo, gateway, fakeCrypto);

    await expect(
      cmd.execute("user-1", "github_pat_abc", "octocat/mis-prompts"),
    ).rejects.toBeInstanceOf(GitHubRepoWriteDeniedError);
    expect(repo.saveCalls.length).toBe(0);
  });

  test("invalid token propagates GitHubTokenInvalidError and never saves", async () => {
    const repo = new FakeRepo();
    const gateway = makeGateway({
      verify: async () => {
        throw new GitHubTokenInvalidError("401");
      },
    });
    const cmd = new ConnectGitHubWithTokenCommand(repo, gateway, fakeCrypto);

    await expect(
      cmd.execute("user-1", "bad-token", "octocat/mis-prompts"),
    ).rejects.toBeInstanceOf(GitHubTokenInvalidError);
    expect(repo.saveCalls.length).toBe(0);
  });

  test("no repo access propagates GitHubRepoAccessDeniedError and never saves", async () => {
    const repo = new FakeRepo();
    const gateway = makeGateway({
      verify: async () => {
        throw new GitHubRepoAccessDeniedError("octocat/secreto");
      },
    });
    const cmd = new ConnectGitHubWithTokenCommand(repo, gateway, fakeCrypto);

    await expect(
      cmd.execute("user-1", "github_pat_abc", "octocat/secreto"),
    ).rejects.toBeInstanceOf(GitHubRepoAccessDeniedError);
    expect(repo.saveCalls.length).toBe(0);
  });

  test("malformed repoFullName fails before any network call", async () => {
    const repo = new FakeRepo();
    let verifyCalled = false;
    const gateway = makeGateway({
      verify: async () => {
        verifyCalled = true;
        return { defaultBranch: "main", canWrite: true };
      },
    });
    const cmd = new ConnectGitHubWithTokenCommand(repo, gateway, fakeCrypto);

    await expect(
      cmd.execute("user-1", "github_pat_abc", "sin-slash"),
    ).rejects.toBeInstanceOf(InvalidRepoFullNameError);
    expect(verifyCalled).toBe(false);
    expect(repo.saveCalls.length).toBe(0);
  });
});
