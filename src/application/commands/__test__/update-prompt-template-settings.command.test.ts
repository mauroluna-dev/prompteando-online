import { describe, expect, test } from "bun:test";
import { UpdatePromptTemplateSettingsCommand } from "@/application/commands/update-prompt-template-settings.command";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import {
  InvalidTemplateVariableNameError,
  Prompt,
  PromptNotFoundError,
  type PromptRow,
} from "@/domain/prompt";

function makePrompt(over: Partial<PromptRow> = {}): Prompt {
  return Prompt.fromRow({
    id: "p1",
    userId: "u1",
    name: "Greeting",
    slug: "greeting",
    description: null,
    currentVersionId: null,
    isTemplate: false,
    templateVarMeta: {},
    tags: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });
}

function makeCommand(prompt: Prompt | null): {
  command: UpdatePromptTemplateSettingsCommand;
  saved: Prompt[];
} {
  const saved: Prompt[] = [];
  const promptRepo = {
    findBySlug: async () => prompt,
    save: async (p: Prompt) => {
      saved.push(p);
    },
  } as unknown as PromptRepository;
  return {
    command: new UpdatePromptTemplateSettingsCommand(promptRepo),
    saved,
  };
}

describe("UpdatePromptTemplateSettingsCommand", () => {
  test("toggles is_template and persists", async () => {
    const { command, saved } = makeCommand(makePrompt());
    const result = await command.execute("u1", "greeting", {
      isTemplate: true,
    });
    expect(result.isTemplate).toBe(true);
    expect(saved).toHaveLength(1);
  });

  test("replaces var metadata", async () => {
    const { command } = makeCommand(makePrompt({ isTemplate: true }));
    const result = await command.execute("u1", "greeting", {
      varMeta: { nombre: { description: "Cliente", default: null } },
    });
    expect(result.templateVarMeta.nombre?.description).toBe("Cliente");
  });

  test("rejects an invalid variable name as a meta key", async () => {
    const { command } = makeCommand(makePrompt({ isTemplate: true }));
    await expect(
      command.execute("u1", "greeting", {
        varMeta: { "bad name": { description: null, default: null } },
      }),
    ).rejects.toBeInstanceOf(InvalidTemplateVariableNameError);
  });

  test("throws when the prompt does not exist", async () => {
    const { command } = makeCommand(null);
    await expect(
      command.execute("u1", "ghost", { isTemplate: true }),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});
