import { RepoFullName } from "./repo-full-name.vo";

export type GitHubConnectionRow = {
  userId: string;
  githubLogin: string;
  encryptedAccessToken: string;
  scopes: string[];
  repoFullName: string;
  defaultBranch: string;
  connectedAt: Date;
};

export type GitHubConnectionView = {
  userId: string;
  githubLogin: string;
  repoFullName: string;
  defaultBranch: string;
  connectedAt: Date;
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
    );
  }

  toView(): GitHubConnectionView {
    return {
      userId: this.userId,
      githubLogin: this.githubLogin,
      repoFullName: this.repoFullName.value,
      defaultBranch: this.defaultBranch,
      connectedAt: this.connectedAt,
    };
  }

  toJSON(): GitHubConnectionView {
    return this.toView();
  }
}
