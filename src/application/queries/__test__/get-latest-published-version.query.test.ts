import { describe, expect, test } from "bun:test";
import { GetLatestPublishedVersionQuery } from "@/application/queries/get-latest-published-version.query";
import type { Cache } from "@/application/ports/cache.port";
import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import { Prompt, type PromptRow } from "@/domain/prompt";
import { PromptVersion, type PromptVersionRow } from "@/domain/prompt-version";

function makePrompt(): Prompt {
  const row: PromptRow = {
    id: "p1",
    userId: "u1",
    name: "Greeting",
    slug: "greeting",
    description: null,
    currentVersionId: "v2",
    isTemplate: false,
    templateVarMeta: {},
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
    content: `soy v${num}`,
    commitMessage: null,
    githubCommitSha: null,
    githubSyncError: null,
    templateVars: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  return PromptVersion.fromRow(row);
}

const noopCache = {
  get: async () => null,
  set: async () => {},
  del: async () => {},
} as unknown as Cache;

function makeQuery(labelMap: Record<string, string> = {}): GetLatestPublishedVersionQuery {
  const promptRepo = {
    findBySlug: async () => makePrompt(),
  } as unknown as PromptRepository;
  const versionRepo = {
    findCurrentForPrompt: async () => makeVersion("v2", 2),
    findById: async (id: string) => (id === "v1" ? makeVersion("v1", 1) : null),
  } as unknown as VersionRepository;
  const labelRepo = {
    findVersionIdByLabel: async (_pid: string, label: string) =>
      labelMap[label] ?? null,
  } as unknown as LabelRepository;
  return new GetLatestPublishedVersionQuery(
    promptRepo,
    versionRepo,
    noopCache,
    labelRepo,
  );
}

describe("GetLatestPublishedVersionQuery — labels", () => {
  test("no label returns the current version", async () => {
    const dto = await makeQuery().execute("u1", "greeting");
    expect(dto?.version).toBe(2);
  });

  test("'latest' resolves to the current version", async () => {
    const dto = await makeQuery().execute("u1", "greeting", "latest");
    expect(dto?.version).toBe(2);
  });

  test("a label resolves to its pinned version", async () => {
    const dto = await makeQuery({ production: "v1" }).execute(
      "u1",
      "greeting",
      "production",
    );
    expect(dto?.version).toBe(1);
    expect(dto?.content).toBe("soy v1");
  });

  test("an unknown label returns null (→ 404)", async () => {
    const dto = await makeQuery().execute("u1", "greeting", "staging");
    expect(dto).toBeNull();
  });
});
