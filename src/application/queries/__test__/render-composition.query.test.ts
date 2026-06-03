import { describe, expect, test } from "bun:test";
import { RenderPromptVersionQuery } from "@/application/queries/render-prompt-version.query";
import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  Prompt,
  PromptCompositionCycleError,
  type PromptRow,
  type Slug,
} from "@/domain/prompt";
import { PromptVersion, type PromptVersionRow } from "@/domain/prompt-version";

type Spec = { slug: string; content: string };

function makePrompt(slug: string): Prompt {
  const row: PromptRow = {
    id: slug,
    userId: "u1",
    name: slug,
    slug,
    description: null,
    currentVersionId: `${slug}-v1`,
    isTemplate: true,
    templateVarMeta: {},
    tags: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
  return Prompt.fromRow(row);
}

function makeVersion(slug: string, content: string): PromptVersion {
  const row: PromptVersionRow = {
    id: `${slug}-v1`,
    promptId: slug,
    versionNumber: 1,
    type: "text",
    content,
    commitMessage: null,
    githubCommitSha: null,
    githubSyncError: null,
    templateVars: [],
    config: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  return PromptVersion.fromRow(row);
}

function makeQuery(specs: Spec[]): RenderPromptVersionQuery {
  const bySlug = new Map(specs.map((s) => [s.slug, s]));
  const promptRepo = {
    findBySlug: async (_u: string, slug: Slug) =>
      bySlug.has(slug.value) ? makePrompt(slug.value) : null,
  } as unknown as PromptRepository;
  const versionRepo = {
    findCurrentForPrompt: async (promptId: string) => {
      const spec = bySlug.get(promptId);
      return spec ? makeVersion(spec.slug, spec.content) : null;
    },
  } as unknown as VersionRepository;
  const labelRepo = {
    findVersionIdByLabel: async () => null,
  } as unknown as LabelRepository;
  return new RenderPromptVersionQuery(promptRepo, versionRepo, labelRepo);
}

describe("RenderPromptVersionQuery — composition", () => {
  test("expands {{>slug}} includes", async () => {
    const q = makeQuery([
      { slug: "main", content: "Header: {{>header}} / fin" },
      { slug: "header", content: "marca {{nombre}}" },
    ]);
    const dto = await q.execute("u1", "main", { nombre: "ACME" });
    expect(dto?.content).toBe("Header: marca ACME / fin");
  });

  test("detects cycles", async () => {
    const q = makeQuery([
      { slug: "a", content: "{{>b}}" },
      { slug: "b", content: "{{>a}}" },
    ]);
    await expect(q.execute("u1", "a", {})).rejects.toBeInstanceOf(
      PromptCompositionCycleError,
    );
  });

  test("leaves unknown includes literal", async () => {
    const q = makeQuery([{ slug: "main", content: "x {{>ghost}} y" }]);
    const dto = await q.execute("u1", "main", {});
    expect(dto?.content).toBe("x {{>ghost}} y");
  });
});
