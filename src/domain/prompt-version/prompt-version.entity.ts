import type { PromptType } from "@/domain/prompt";
import { VersionNumber } from "./version-number.vo";

export type PromptVersionRow = {
  id: string;
  promptId: string;
  versionNumber: number;
  type: PromptType;
  content: string;
  commitMessage: string | null;
  githubCommitSha: string | null;
  githubSyncError: string | null;
  templateVars: string[];
  createdAt: Date;
};

export class PromptVersion {
  private constructor(
    readonly id: string,
    readonly promptId: string,
    readonly versionNumber: VersionNumber,
    readonly type: PromptType,
    readonly content: string,
    readonly commitMessage: string | null,
    private _githubCommitSha: string | null,
    private _githubSyncError: string | null,
    readonly templateVars: string[],
    readonly createdAt: Date,
  ) {}

  static create(
    id: string,
    promptId: string,
    versionNumber: VersionNumber,
    type: PromptType,
    content: string,
    commitMessage: string | null,
    templateVars: string[],
    now: Date,
  ): PromptVersion {
    return new PromptVersion(
      id,
      promptId,
      versionNumber,
      type,
      content,
      commitMessage,
      null,
      null,
      templateVars,
      now,
    );
  }

  static fromRow(row: PromptVersionRow): PromptVersion {
    return new PromptVersion(
      row.id,
      row.promptId,
      VersionNumber.parse(row.versionNumber),
      row.type,
      row.content,
      row.commitMessage,
      row.githubCommitSha,
      row.githubSyncError,
      row.templateVars,
      row.createdAt,
    );
  }

  get githubCommitSha(): string | null {
    return this._githubCommitSha;
  }

  get githubSyncError(): string | null {
    return this._githubSyncError;
  }

  attachGithubCommit(sha: string): void {
    this._githubCommitSha = sha;
    this._githubSyncError = null;
  }

  markGithubSyncFailed(error: string): void {
    this._githubSyncError = error;
  }

  toJSON(): PromptVersionDTO {
    return {
      id: this.id,
      promptId: this.promptId,
      versionNumber: this.versionNumber.value,
      type: this.type,
      content: this.content,
      commitMessage: this.commitMessage,
      githubCommitSha: this._githubCommitSha,
      githubSyncError: this._githubSyncError,
      templateVars: this.templateVars,
      createdAt: this.createdAt,
    };
  }
}

export type PromptVersionDTO = {
  id: string;
  promptId: string;
  versionNumber: number;
  type: PromptType;
  content: string;
  commitMessage: string | null;
  githubCommitSha: string | null;
  githubSyncError: string | null;
  templateVars: string[];
  createdAt: Date;
};
