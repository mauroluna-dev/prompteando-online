import { describe, expect, test } from "bun:test";
import { RenderPromptVersionQuery } from "@/application/queries/render-prompt-version.query";
import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  MissingTemplateVariablesError,
  NotATemplateError,
  Prompt,
  type PromptRow,
  type TemplateVarMeta,
} from "@/domain/prompt";
import { PromptVersion, type PromptVersionRow } from "@/domain/prompt-version";

function makePrompt(over: Partial<PromptRow>): Prompt {
  return Prompt.fromRow({
    id: "p1",
    userId: "u1",
    name: "Greeting",
    slug: "greeting",
    description: null,
    currentVersionId: "v2",
    isTemplate: true,
    templateVarMeta: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });
}

function makeVersion(over: Partial<PromptVersionRow>): PromptVersion {
  return PromptVersion.fromRow({
    id: "v2",
    promptId: "p1",
    versionNumber: 2,
    type: "text",
    content: "Hola {{nombre}}, sobre {{producto}}.",
    commitMessage: null,
    githubCommitSha: null,
    githubSyncError: null,
    templateVars: ["nombre", "producto"],
    config: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });
}

function makeQuery(
  prompt: Prompt | null,
  current: PromptVersion | null,
  byNumber: Record<number, PromptVersion> = {},
): RenderPromptVersionQuery {
  const promptRepo = {
    findBySlug: async () => prompt,
  } as unknown as PromptRepository;
  const versionRepo = {
    findCurrentForPrompt: async () => current,
    findByPromptIdAndNumber: async (_id: string, n: { value: number }) =>
      byNumber[n.value] ?? null,
  } as unknown as VersionRepository;
  const labelRepo = {
    findVersionIdByLabel: async () => null,
  } as unknown as LabelRepository;
  return new RenderPromptVersionQuery(promptRepo, versionRepo, labelRepo);
}

describe("RenderPromptVersionQuery", () => {
  test("renders with all vars provided (200)", async () => {
    const q = makeQuery(makePrompt({}), makeVersion({}));
    const dto = await q.execute("u1", "greeting", {
      nombre: "Ana",
      producto: "Plan Pro",
    });
    expect(dto).toEqual({
      type: "text",
      content: "Hola Ana, sobre Plan Pro.",
      messages: null,
      config: {},
      version: 2,
      varsUsed: ["nombre", "producto"],
      missingVars: [],
    });
  });

  test("throws strict 422 when a required var is missing", async () => {
    const q = makeQuery(makePrompt({}), makeVersion({}));
    await expect(
      q.execute("u1", "greeting", { nombre: "Ana" }),
    ).rejects.toBeInstanceOf(MissingTemplateVariablesError);
  });

  test("a declared default makes a var optional", async () => {
    const meta: TemplateVarMeta = {
      producto: { description: null, default: "Plan Pro" },
    };
    const q = makeQuery(makePrompt({ templateVarMeta: meta }), makeVersion({}));
    const dto = await q.execute("u1", "greeting", { nombre: "Ana" });
    expect(dto?.content).toBe("Hola Ana, sobre Plan Pro.");
  });

  test("throws NotATemplate when is_template is false", async () => {
    const q = makeQuery(makePrompt({ isTemplate: false }), makeVersion({}));
    await expect(
      q.execute("u1", "greeting", {}),
    ).rejects.toBeInstanceOf(NotATemplateError);
  });

  test("returns null for an unknown prompt", async () => {
    const q = makeQuery(null, null);
    expect(await q.execute("u1", "ghost", {})).toBeNull();
  });

  test("pins to a specific version snapshot", async () => {
    const v1 = makeVersion({
      id: "v1",
      versionNumber: 1,
      content: "Solo {{nombre}}.",
      templateVars: ["nombre"],
    });
    const q = makeQuery(makePrompt({}), makeVersion({}), { 1: v1 });
    const dto = await q.execute("u1", "greeting", { nombre: "Ana" }, { version: 1 });
    expect(dto?.version).toBe(1);
    expect(dto?.content).toBe("Solo Ana.");
  });
});
