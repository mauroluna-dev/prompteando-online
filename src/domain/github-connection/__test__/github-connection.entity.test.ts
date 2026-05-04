import { describe, expect, test } from "bun:test";
import {
  BackfillStateTransitionError,
  GitHubConnection,
  RepoFullName,
} from "@/domain/github-connection";

const NOW = new Date("2026-05-03T22:00:00Z");

function fresh(): GitHubConnection {
  return GitHubConnection.create(
    "u1",
    "octocat",
    "enc:gho_x",
    ["repo"],
    RepoFullName.parse("octocat/promptstash-octocat"),
    "main",
    NOW,
  );
}

describe("GitHubConnection backfill state machine", () => {
  test("create() leaves all backfill_* fields null", () => {
    const c = fresh();
    expect(c.backfillStatus).toBeNull();
    expect(c.backfillTotal).toBeNull();
    expect(c.backfillProcessed).toBeNull();
    expect(c.backfillStartedAt).toBeNull();
    expect(c.backfillFinishedAt).toBeNull();
    expect(c.backfillFailureReason).toBeNull();
  });

  test("markBackfillPending sets total + processed=0", () => {
    const c = fresh();
    c.markBackfillPending(15);
    expect(c.backfillStatus).toBe("pending");
    expect(c.backfillTotal).toBe(15);
    expect(c.backfillProcessed).toBe(0);
    expect(c.backfillStartedAt).toBeNull();
    expect(c.backfillFinishedAt).toBeNull();
  });

  test("markBackfillRunning requires pending", () => {
    const c = fresh();
    expect(() => c.markBackfillRunning(NOW)).toThrow(
      BackfillStateTransitionError,
    );
    c.markBackfillPending(5);
    c.markBackfillRunning(NOW);
    expect(c.backfillStatus).toBe("running");
    expect(c.backfillStartedAt).toEqual(NOW);
  });

  test("incrementBackfillProcessed accumulates while running", () => {
    const c = fresh();
    c.markBackfillPending(3);
    c.markBackfillRunning(NOW);
    c.incrementBackfillProcessed();
    c.incrementBackfillProcessed();
    c.incrementBackfillProcessed();
    expect(c.backfillProcessed).toBe(3);
  });

  test("increment outside running throws", () => {
    const c = fresh();
    expect(() => c.incrementBackfillProcessed()).toThrow(
      BackfillStateTransitionError,
    );
  });

  test("markBackfillCompleted only from running", () => {
    const c = fresh();
    c.markBackfillPending(2);
    expect(() => c.markBackfillCompleted(NOW)).toThrow(
      BackfillStateTransitionError,
    );
    c.markBackfillRunning(NOW);
    c.markBackfillCompleted(NOW);
    expect(c.backfillStatus).toBe("completed");
    expect(c.backfillFinishedAt).toEqual(NOW);
    expect(c.backfillFailureReason).toBeNull();
  });

  test("markBackfillFailed from pending or running", () => {
    const a = fresh();
    a.markBackfillPending(2);
    a.markBackfillFailed("token_invalid", NOW);
    expect(a.backfillStatus).toBe("failed");
    expect(a.backfillFailureReason).toBe("token_invalid");
    expect(a.backfillFinishedAt).toEqual(NOW);

    const b = fresh();
    b.markBackfillPending(2);
    b.markBackfillRunning(NOW);
    b.markBackfillFailed("repo_missing", NOW);
    expect(b.backfillStatus).toBe("failed");
  });

  test("markBackfillFailed from completed throws", () => {
    const c = fresh();
    c.markBackfillPending(2);
    c.markBackfillRunning(NOW);
    c.markBackfillCompleted(NOW);
    expect(() => c.markBackfillFailed("x", NOW)).toThrow(
      BackfillStateTransitionError,
    );
  });

  test("re-pending allowed from completed and failed (re-trigger)", () => {
    const a = fresh();
    a.markBackfillPending(1);
    a.markBackfillRunning(NOW);
    a.markBackfillCompleted(NOW);
    a.markBackfillPending(2);
    expect(a.backfillStatus).toBe("pending");
    expect(a.backfillTotal).toBe(2);

    const b = fresh();
    b.markBackfillPending(1);
    b.markBackfillFailed("x", NOW);
    b.markBackfillPending(5);
    expect(b.backfillStatus).toBe("pending");
  });

  test("fromRow reconstitutes backfill fields", () => {
    const c = GitHubConnection.fromRow({
      userId: "u1",
      githubLogin: "octocat",
      encryptedAccessToken: "enc",
      scopes: ["repo"],
      repoFullName: "octocat/promptstash-octocat",
      defaultBranch: "main",
      connectedAt: NOW,
      backfillStatus: "running",
      backfillTotal: 7,
      backfillProcessed: 3,
      backfillStartedAt: NOW,
      backfillFinishedAt: null,
      backfillFailureReason: null,
    });
    expect(c.backfillStatus).toBe("running");
    expect(c.backfillTotal).toBe(7);
    expect(c.backfillProcessed).toBe(3);
  });

  test("fromRow normalizes unknown status to null", () => {
    const c = GitHubConnection.fromRow({
      userId: "u1",
      githubLogin: "octocat",
      encryptedAccessToken: "enc",
      scopes: ["repo"],
      repoFullName: "octocat/promptstash-octocat",
      defaultBranch: "main",
      connectedAt: NOW,
      backfillStatus: "garbage",
      backfillTotal: null,
      backfillProcessed: null,
      backfillStartedAt: null,
      backfillFinishedAt: null,
      backfillFailureReason: null,
    });
    expect(c.backfillStatus).toBeNull();
  });

  test("toJSON includes backfill fields", () => {
    const c = fresh();
    c.markBackfillPending(3);
    c.markBackfillRunning(NOW);
    c.incrementBackfillProcessed();
    const v = c.toJSON();
    expect(v.backfillStatus).toBe("running");
    expect(v.backfillTotal).toBe(3);
    expect(v.backfillProcessed).toBe(1);
    expect(v.backfillStartedAt).toEqual(NOW);
  });
});
