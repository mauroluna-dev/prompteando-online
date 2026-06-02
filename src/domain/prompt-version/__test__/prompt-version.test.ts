import { describe, expect, test } from "bun:test";
import { PromptVersion, VersionNumber } from "../index";

describe("PromptVersion", () => {
  test("create() leaves both github fields null", () => {
    const now = new Date("2026-05-03T20:00:00Z");
    const v = PromptVersion.create(
      "v1",
      "p1",
      VersionNumber.parse(1),
      "text",
      "body",
      "first",
      [],
      {},
      now,
    );
    expect(v.githubCommitSha).toBeNull();
    expect(v.githubSyncError).toBeNull();
  });

  test("attachGithubCommit() sets sha and clears any previous error", () => {
    const v = PromptVersion.create(
      "v1",
      "p1",
      VersionNumber.parse(1),
      "text",
      "body",
      null,
      [],
      {},
      new Date(),
    );
    v.markGithubSyncFailed("transient");
    expect(v.githubSyncError).toBe("transient");
    v.attachGithubCommit("abc123");
    expect(v.githubCommitSha).toBe("abc123");
    expect(v.githubSyncError).toBeNull();
  });

  test("markGithubSyncFailed() persists reason without touching sha", () => {
    const v = PromptVersion.create(
      "v1",
      "p1",
      VersionNumber.parse(1),
      "text",
      "body",
      null,
      [],
      {},
      new Date(),
    );
    v.attachGithubCommit("sha-x");
    v.markGithubSyncFailed("token_invalid");
    expect(v.githubSyncError).toBe("token_invalid");
    expect(v.githubCommitSha).toBe("sha-x");
  });

  test("fromRow() round-trips github fields", () => {
    const v = PromptVersion.fromRow({
      id: "v1",
      promptId: "p1",
      versionNumber: 4,
      type: "text",
      content: "body",
      commitMessage: "msg",
      githubCommitSha: null,
      githubSyncError: "rate_limited",
      templateVars: ["nombre"],
      config: {},
      createdAt: new Date("2026-05-03T20:00:00Z"),
    });
    expect(v.githubCommitSha).toBeNull();
    expect(v.githubSyncError).toBe("rate_limited");
    expect(v.templateVars).toEqual(["nombre"]);
  });

  test("toJSON() includes githubSyncError", () => {
    const v = PromptVersion.create(
      "v1",
      "p1",
      VersionNumber.parse(1),
      "text",
      "body",
      null,
      [],
      {},
      new Date("2026-05-03T20:00:00Z"),
    );
    v.markGithubSyncFailed("repo_missing");
    const dto = v.toJSON();
    expect(dto.githubSyncError).toBe("repo_missing");
    expect(dto.githubCommitSha).toBeNull();
  });
});
