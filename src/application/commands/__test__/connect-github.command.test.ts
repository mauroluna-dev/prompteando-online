import { describe, expect, test } from "bun:test";
import { ConnectGitHubCommand } from "@/application/commands/connect-github.command";
import type { CryptoPort } from "@/application/ports/crypto.port";
import type { GitHubConnectionRepository } from "@/application/ports/github-connection-repository.port";
import type {
  GitHubAuthenticatedUser,
  GitHubEnsureReadmeResult,
  GitHubEnsureRepoResult,
  GitHubGateway,
  GitHubTokenExchange,
} from "@/application/ports/github-gateway.port";
import {
  GitHubInsufficientScopeError,
  type GitHubConnection,
} from "@/domain/github-connection";

class FakeRepo implements GitHubConnectionRepository {
  saveCalls: GitHubConnection[] = [];
  deleteCalls: string[] = [];

  async save(connection: GitHubConnection): Promise<void> {
    this.saveCalls.push(connection);
  }

  async findByUserId(): Promise<GitHubConnection | null> {
    return null;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    this.deleteCalls.push(userId);
    return true;
  }

  async updateBackfillState(): Promise<void> {}

  async findUnfinishedBackfills(): Promise<GitHubConnection[]> {
    return [];
  }
}

class FakeGateway implements GitHubGateway {
  exchangeCalls = 0;
  ensureRepoCalls = 0;
  ensureReadmeCalls = 0;

  constructor(
    private readonly tokenResponse: GitHubTokenExchange,
    private readonly userResponse: GitHubAuthenticatedUser = { login: "octocat" },
    private readonly repoResponse: GitHubEnsureRepoResult = {
      fullName: "octocat/prompteando-octocat",
      defaultBranch: "main",
      wasCreated: true,
    },
    private readonly readmeResponse: GitHubEnsureReadmeResult = {
      committed: true,
      sha: "abc123",
    },
  ) {}

  async exchangeCodeForToken(): Promise<GitHubTokenExchange> {
    this.exchangeCalls++;
    return this.tokenResponse;
  }

  async getAuthenticatedUser(): Promise<GitHubAuthenticatedUser> {
    return this.userResponse;
  }

  async verifyRepoAccess(): Promise<{ defaultBranch: string; canWrite: boolean }> {
    return { defaultBranch: "main", canWrite: true };
  }

  async ensureRepo(): Promise<GitHubEnsureRepoResult> {
    this.ensureRepoCalls++;
    return this.repoResponse;
  }

  async ensureReadme(): Promise<GitHubEnsureReadmeResult> {
    this.ensureReadmeCalls++;
    return this.readmeResponse;
  }

  async commitVersion(): Promise<{ sha: string }> {
    throw new Error("commitVersion not exercised in these tests");
  }

  async commitVersionBackdated(): Promise<{ sha: string }> {
    throw new Error("commitVersionBackdated not exercised in these tests");
  }
}

const fakeCrypto: CryptoPort = {
  randomUUID: () => "fake-uuid",
  randomBytes: (n) => new Uint8Array(n),
  hashPassword: async (s) => s,
  verifyPassword: async () => true,
  encrypt: (plain) => `enc:${plain}`,
  decrypt: (ct) => ct.replace(/^enc:/, ""),
};

describe("ConnectGitHubCommand", () => {
  test("happy path persists connection with encrypted token", async () => {
    const repo = new FakeRepo();
    const gateway = new FakeGateway({
      accessToken: "gho_abc",
      scopes: ["repo", "read:user"],
    });
    const cmd = new ConnectGitHubCommand(repo, gateway, fakeCrypto);

    const result = await cmd.execute("user-1", "code-xyz");

    expect(result.userId).toBe("user-1");
    expect(result.githubLogin).toBe("octocat");
    expect(result.encryptedAccessToken).toBe("enc:gho_abc");
    expect(result.scopes).toEqual(["repo", "read:user"]);
    expect(result.repoFullName.value).toBe("octocat/prompteando-octocat");
    expect(repo.saveCalls.length).toBe(1);
    expect(gateway.ensureRepoCalls).toBe(1);
    expect(gateway.ensureReadmeCalls).toBe(1);
  });

  test("insufficient scope throws and never touches repo/gateway downstream", async () => {
    const repo = new FakeRepo();
    const gateway = new FakeGateway({
      accessToken: "gho_abc",
      scopes: ["read:user"], // missing "repo"
    });
    const cmd = new ConnectGitHubCommand(repo, gateway, fakeCrypto);

    let caught: unknown;
    try {
      await cmd.execute("user-1", "code-xyz");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GitHubInsufficientScopeError);
    expect((caught as GitHubInsufficientScopeError).missing).toEqual(["repo"]);
    expect(repo.saveCalls.length).toBe(0);
    expect(gateway.ensureRepoCalls).toBe(0);
    expect(gateway.ensureReadmeCalls).toBe(0);
  });
});
