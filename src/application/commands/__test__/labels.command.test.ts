import { describe, expect, test } from "bun:test";
import { AssignLabelCommand } from "@/application/commands/assign-label.command";
import { RemoveLabelCommand } from "@/application/commands/remove-label.command";
import { ListLabelsQuery } from "@/application/queries/list-labels.query";
import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  CannotAssignVirtualLabelError,
  LabelNotFoundError,
  Prompt,
  type PromptRow,
} from "@/domain/prompt";
import { PromptVersion, type PromptVersionRow, VersionNumber } from "@/domain/prompt-version";

function makePrompt(): Prompt {
  const row: PromptRow = {
    id: "p1",
    userId: "u1",
    name: "Greeting",
    slug: "greeting",
    description: null,
    currentVersionId: "v1",
    isTemplate: false,
    templateVarMeta: {},
    tags: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  return Prompt.fromRow(row);
}

function makeVersion(id: string, num: number): PromptVersion {
  const row: PromptVersionRow = {
    id,
    promptId: "p1",
    versionNumber: num,
    type: "text",
    content: "x",
    commitMessage: null,
    githubCommitSha: null,
    githubSyncError: null,
    templateVars: [],
    config: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  return PromptVersion.fromRow(row);
}

function makeLabelRepo(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial)); // label -> versionId
  return {
    store,
    repo: {
      assign: async (_pid: string, label: string, versionId: string) => {
        store.set(label, versionId);
      },
      remove: async (_pid: string, label: string) => store.delete(label),
      findVersionIdByLabel: async (_pid: string, label: string) =>
        store.get(label) ?? null,
      listForPrompt: async () =>
        [...store.entries()].map(([label, versionId]) => ({ label, versionId })),
    } as unknown as LabelRepository,
  };
}

const promptRepo = {
  findBySlug: async () => makePrompt(),
} as unknown as PromptRepository;

const versionRepo = {
  findByPromptIdAndNumber: async (_id: string, n: VersionNumber) =>
    n.value === 2 ? makeVersion("v2", 2) : null,
  findById: async (id: string) =>
    id === "v2" ? makeVersion("v2", 2) : makeVersion(id, 1),
} as unknown as VersionRepository;

describe("labels", () => {
  test("AssignLabel points a label at a version", async () => {
    const { store, repo } = makeLabelRepo();
    await new AssignLabelCommand(promptRepo, versionRepo, repo).execute(
      "u1",
      "greeting",
      "production",
      VersionNumber.parse(2),
    );
    expect(store.get("production")).toBe("v2");
  });

  test("AssignLabel rejects the virtual latest label", async () => {
    const { repo } = makeLabelRepo();
    await expect(
      new AssignLabelCommand(promptRepo, versionRepo, repo).execute(
        "u1",
        "greeting",
        "latest",
        VersionNumber.parse(2),
      ),
    ).rejects.toBeInstanceOf(CannotAssignVirtualLabelError);
  });

  test("RemoveLabel throws when the label does not exist", async () => {
    const { repo } = makeLabelRepo();
    await expect(
      new RemoveLabelCommand(promptRepo, repo).execute("u1", "greeting", "production"),
    ).rejects.toBeInstanceOf(LabelNotFoundError);
  });

  test("ListLabels maps version ids to numbers", async () => {
    const { repo } = makeLabelRepo({ production: "v2" });
    const labels = await new ListLabelsQuery(promptRepo, versionRepo, repo).execute(
      "u1",
      "greeting",
    );
    expect(labels).toEqual([{ label: "production", versionNumber: 2 }]);
  });
});
