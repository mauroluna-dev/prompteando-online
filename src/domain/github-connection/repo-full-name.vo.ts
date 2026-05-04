import { InvalidRepoFullNameError } from "./github-connection.errors";

const REPO_FULL_NAME_REGEX = /^[a-z0-9._-]+\/[a-z0-9._-]+$/i;

export class RepoFullName {
  private constructor(
    readonly value: string,
    readonly owner: string,
    readonly repo: string,
  ) {}

  static parse(input: string): RepoFullName {
    if (!REPO_FULL_NAME_REGEX.test(input)) {
      throw new InvalidRepoFullNameError(input);
    }
    const [owner, repo] = input.split("/") as [string, string];
    return new RepoFullName(input, owner, repo);
  }

  toString(): string {
    return this.value;
  }
}
