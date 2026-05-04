import { Octokit } from "@octokit/rest";
import {
  GitHubCommitGatewayError,
  type GitHubAuthenticatedUser,
  type GitHubCommitVersionBackdatedInput,
  type GitHubCommitVersionInput,
  type GitHubCommitVersionResult,
  type GitHubEnsureReadmeResult,
  type GitHubEnsureRepoResult,
  type GitHubGateway,
  type GitHubTokenExchange,
} from "@/application/ports/github-gateway.port";
import {
  CONSTANTS,
  GitHubOAuthFailedError,
  GitHubRepoCreationFailedError,
} from "@/domain/github-connection";
import { mapCommitError, statusOf, messageOf } from "./map-commit-error";

const TOKEN_EXCHANGE_URL = "https://github.com/login/oauth/access_token";

// GitHub REST API version. Pinning this avoids the @octokit/request
// "endpoint is deprecated" warning that fires when no version header
// is sent — see https://docs.github.com/en/rest/about-the-rest-api/api-versions
const GITHUB_API_VERSION = "2022-11-28";

function buildOctokit(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
    request: { headers: { "x-github-api-version": GITHUB_API_VERSION } },
  });
}

type AccessTokenResponse =
  | { access_token: string; scope: string; token_type: string }
  | { error: string; error_description?: string };

export class OctokitGitHubAdapter implements GitHubGateway {
  constructor(
    private readonly config: { clientId: string; clientSecret: string },
  ) {}

  async exchangeCodeForToken(code: string): Promise<GitHubTokenExchange> {
    const res = await fetch(TOKEN_EXCHANGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
    });

    if (!res.ok) {
      throw new GitHubOAuthFailedError(`HTTP ${res.status}`);
    }

    const json = (await res.json()) as AccessTokenResponse;
    if ("error" in json) {
      throw new GitHubOAuthFailedError(json.error_description ?? json.error);
    }

    return {
      accessToken: json.access_token,
      scopes: json.scope.split(",").filter(Boolean),
    };
  }

  async getAuthenticatedUser(
    accessToken: string,
  ): Promise<GitHubAuthenticatedUser> {
    const octokit = buildOctokit(accessToken);
    const { data } = await octokit.users.getAuthenticated();
    return { login: data.login };
  }

  async ensureRepo(
    accessToken: string,
    repoName: string,
  ): Promise<GitHubEnsureRepoResult> {
    const octokit = buildOctokit(accessToken);
    const { data: me } = await octokit.users.getAuthenticated();
    const owner = me.login;

    try {
      const { data: existing } = await octokit.repos.get({
        owner,
        repo: repoName,
      });
      return {
        fullName: existing.full_name,
        defaultBranch: existing.default_branch,
        wasCreated: false,
      };
    } catch (err) {
      if (!isStatus(err, 404)) {
        throw new GitHubRepoCreationFailedError(messageOf(err));
      }
    }

    try {
      const { data: created } =
        await octokit.repos.createForAuthenticatedUser({
          name: repoName,
          private: true,
          description: CONSTANTS.REPO_DESCRIPTION,
          auto_init: false,
        });
      return {
        fullName: created.full_name,
        defaultBranch: created.default_branch ?? CONSTANTS.DEFAULT_BRANCH,
        wasCreated: true,
      };
    } catch (err) {
      throw new GitHubRepoCreationFailedError(messageOf(err));
    }
  }

  async ensureReadme(
    accessToken: string,
    repoFullName: string,
    defaultBranch: string,
  ): Promise<GitHubEnsureReadmeResult> {
    const octokit = buildOctokit(accessToken);
    const [owner, repo] = repoFullName.split("/") as [string, string];

    try {
      await octokit.repos.getContent({ owner, repo, path: "README.md" });
      return { committed: false };
    } catch (err) {
      if (!isStatus(err, 404)) {
        throw new GitHubRepoCreationFailedError(messageOf(err));
      }
    }

    const contentB64 = Buffer.from(CONSTANTS.README_TEMPLATE, "utf8").toString(
      "base64",
    );
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: "README.md",
      message: "chore: initial promptstash README",
      content: contentB64,
      branch: defaultBranch,
    });

    return { committed: true, sha: data.commit.sha };
  }

  async commitVersion(
    input: GitHubCommitVersionInput,
  ): Promise<GitHubCommitVersionResult> {
    const [owner, repo] = input.repoFullName.split("/") as [string, string];
    const octokit = buildOctokit(input.accessToken);

    let existingSha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: input.path,
        ref: input.branch,
      });
      if (!Array.isArray(data) && "sha" in data) {
        existingSha = data.sha;
      }
    } catch (err) {
      if (statusOf(err) !== 404) {
        throw mapCommitError(err);
      }
      // 404 → file doesn't exist yet; first commit at this path.
    }

    try {
      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: input.path,
        message: input.commitMessage,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        sha: existingSha,
      });
      const sha = data.commit.sha;
      if (!sha) {
        throw new GitHubCommitGatewayError("unknown", "missing commit sha");
      }
      return { sha };
    } catch (err) {
      if (err instanceof GitHubCommitGatewayError) throw err;
      throw mapCommitError(err);
    }
  }

  async commitVersionBackdated(
    input: GitHubCommitVersionBackdatedInput,
  ): Promise<GitHubCommitVersionResult> {
    const [owner, repo] = input.repoFullName.split("/") as [string, string];
    const octokit = buildOctokit(input.accessToken);
    const isoDate = input.committedAt.toISOString();

    try {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        encoding: "base64",
      });

      const { data: ref } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${input.branch}`,
      });
      const parentSha = ref.object.sha;

      const { data: parentCommit } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: parentSha,
      });

      const { data: tree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: parentCommit.tree.sha,
        tree: [
          {
            path: input.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      });

      const { data: commit } = await octokit.git.createCommit({
        owner,
        repo,
        message: input.commitMessage,
        tree: tree.sha,
        parents: [parentSha],
        author: {
          name: input.authorName,
          email: input.authorEmail,
          date: isoDate,
        },
        committer: {
          name: input.authorName,
          email: input.authorEmail,
          date: isoDate,
        },
      });

      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${input.branch}`,
        sha: commit.sha,
      });

      return { sha: commit.sha };
    } catch (err) {
      if (err instanceof GitHubCommitGatewayError) throw err;
      throw mapCommitError(err);
    }
  }
}

function isStatus(err: unknown, status: number): boolean {
  return statusOf(err) === status;
}
