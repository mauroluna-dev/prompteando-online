import { describe, expect, test } from "bun:test";
import { ExportAllPromptsQuery } from "@/application/queries/export-all-prompts.query";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { Prompt, type PromptRow } from "@/domain/prompt";
import { PromptVersion, type PromptVersionRow } from "@/domain/prompt-version";

function makePrompt(row: Partial<PromptRow> & { id: string }): Prompt {
  return Prompt.fromRow({
    userId: "u1",
    name: row.id,
    slug: row.id,
    description: null,
    currentVersionId: null,
    isTemplate: false,
    templateVarMeta: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...row,
  });
}

function makeVersion(
  row: Partial<PromptVersionRow> & { id: string; promptId: string; versionNumber: number },
): PromptVersion {
  return PromptVersion.fromRow({
    type: "text",
    content: `content-${row.versionNumber}`,
    commitMessage: null,
    githubCommitSha: null,
    githubSyncError: null,
    templateVars: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...row,
  });
}

/** In-memory fakes that return rows in a deliberately scrambled order. */
function makeRepos(
  prompts: Prompt[],
  versionsByPrompt: Record<string, PromptVersion[]>,
): { promptRepo: PromptRepository; versionRepo: VersionRepository } {
  const promptRepo = {
    save: async () => {},
    findById: async () => null,
    findBySlug: async () => null,
    findAllByUserId: async (userId: string) =>
      prompts.filter((p) => p.userId === userId),
    delete: async () => false,
    findNextAvailableSlug: async () => {
      throw new Error("not used");
    },
  } as unknown as PromptRepository;

  const versionRepo = {
    appendNewVersion: async () => {},
    findByPromptIdAndNumber: async () => null,
    findCurrentForPrompt: async () => null,
    findAllForPrompt: async (promptId: string) =>
      versionsByPrompt[promptId] ?? [],
    countForPrompt: async () => 0,
    findById: async () => null,
    markGithubCommit: async () => {},
    markGithubSyncFailed: async () => {},
    findOldestPendingForUser: async () => null,
    countPendingForUser: async () => 0,
  } as unknown as VersionRepository;

  return { promptRepo, versionRepo };
}

describe("ExportAllPromptsQuery", () => {
  test("returns an empty prompts array when the user has none", async () => {
    const { promptRepo, versionRepo } = makeRepos([], {});
    const bundle = await new ExportAllPromptsQuery(promptRepo, versionRepo).execute(
      "u1",
    );
    expect(bundle.prompts).toEqual([]);
    expect(bundle.user.id).toBe("u1");
    expect(bundle.generatedAt).toBeInstanceOf(Date);
  });

  test("orders prompts by createdAt ASC, id ASC as tie-break", async () => {
    const prompts = [
      makePrompt({ id: "c", createdAt: new Date("2026-03-01T00:00:00Z") }),
      makePrompt({ id: "b", createdAt: new Date("2026-01-01T00:00:00Z") }),
      makePrompt({ id: "a", createdAt: new Date("2026-01-01T00:00:00Z") }),
    ];
    const { promptRepo, versionRepo } = makeRepos(prompts, {});
    const bundle = await new ExportAllPromptsQuery(promptRepo, versionRepo).execute(
      "u1",
    );
    expect(bundle.prompts.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  test("orders versions by versionNumber ASC within a prompt", async () => {
    const prompts = [makePrompt({ id: "p1" })];
    const versionsByPrompt = {
      p1: [
        makeVersion({ id: "v3", promptId: "p1", versionNumber: 3 }),
        makeVersion({ id: "v1", promptId: "p1", versionNumber: 1 }),
        makeVersion({ id: "v2", promptId: "p1", versionNumber: 2 }),
      ],
    };
    const { promptRepo, versionRepo } = makeRepos(prompts, versionsByPrompt);
    const bundle = await new ExportAllPromptsQuery(promptRepo, versionRepo).execute(
      "u1",
    );
    expect(bundle.prompts[0]?.versions.map((v) => v.versionNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  test("never leaks prompts or versions from other users", async () => {
    const prompts = [
      makePrompt({ id: "mine", userId: "u1" }),
      makePrompt({ id: "theirs", userId: "u2" }),
    ];
    const versionsByPrompt = {
      mine: [makeVersion({ id: "vm", promptId: "mine", versionNumber: 1 })],
      theirs: [makeVersion({ id: "vt", promptId: "theirs", versionNumber: 1 })],
    };
    const { promptRepo, versionRepo } = makeRepos(prompts, versionsByPrompt);
    const bundle = await new ExportAllPromptsQuery(promptRepo, versionRepo).execute(
      "u1",
    );
    expect(bundle.prompts.map((p) => p.id)).toEqual(["mine"]);
  });

  test("maps currentVersionNumber, commitMessage and githubCommitSha (incl. nulls)", async () => {
    const prompts = [makePrompt({ id: "p1", currentVersionId: "v2" })];
    const versionsByPrompt = {
      p1: [
        makeVersion({
          id: "v1",
          promptId: "p1",
          versionNumber: 1,
          commitMessage: null,
          githubCommitSha: null,
        }),
        makeVersion({
          id: "v2",
          promptId: "p1",
          versionNumber: 2,
          commitMessage: "fix grammar",
          githubCommitSha: "abc123",
        }),
      ],
    };
    const { promptRepo, versionRepo } = makeRepos(prompts, versionsByPrompt);
    const bundle = await new ExportAllPromptsQuery(promptRepo, versionRepo).execute(
      "u1",
    );
    const prompt = bundle.prompts[0];
    expect(prompt?.currentVersionNumber).toBe(2);
    expect(prompt?.versions[0]?.commitMessage).toBeNull();
    expect(prompt?.versions[0]?.githubCommitSha).toBeNull();
    expect(prompt?.versions[1]?.commitMessage).toBe("fix grammar");
    expect(prompt?.versions[1]?.githubCommitSha).toBe("abc123");
  });

  test("currentVersionNumber is null when the prompt has no current version", async () => {
    const prompts = [makePrompt({ id: "p1", currentVersionId: null })];
    const versionsByPrompt = {
      p1: [makeVersion({ id: "v1", promptId: "p1", versionNumber: 1 })],
    };
    const { promptRepo, versionRepo } = makeRepos(prompts, versionsByPrompt);
    const bundle = await new ExportAllPromptsQuery(promptRepo, versionRepo).execute(
      "u1",
    );
    expect(bundle.prompts[0]?.currentVersionNumber).toBeNull();
  });
});
