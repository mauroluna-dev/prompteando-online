import type { LabelRepository } from "@/application/ports/label-repository.port";
import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  applyIncludes,
  type ChatMessage,
  CONSTANTS,
  extractIncludes,
  MissingTemplateVariablesError,
  NotATemplateError,
  parseChatMessages,
  PromptCompositionCycleError,
  renderChat,
  renderTemplate,
  Slug,
} from "@/domain/prompt";
import {
  type PromptVersion,
  type RenderedPromptDTO,
  VersionNumber,
} from "@/domain/prompt-version";

export type RenderTarget = {
  version?: number;
  label?: string;
  placeholders?: Record<string, ChatMessage[]>;
};

/**
 * Renders a template prompt by substituting `{{var}}`. Strict: throws
 * MissingTemplateVariablesError (→ 422) if a required variable has
 * neither a provided value nor a declared default. Returns `null` when
 * the prompt/version/label does not exist (→ 404). The target version
 * is the current one by default, or pinned by `version` / `label`.
 */
export class RenderPromptVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
    private readonly labelRepo: LabelRepository,
  ) {}

  async execute(
    ownerId: string,
    rawSlug: string,
    vars: Readonly<Record<string, string>>,
    target: RenderTarget = {},
  ): Promise<RenderedPromptDTO | null> {
    let parsedSlug: Slug;
    try {
      parsedSlug = Slug.parse(rawSlug);
    } catch {
      return null;
    }

    const prompt = await this.promptRepo.findBySlug(ownerId, parsedSlug);
    if (!prompt) return null;
    if (!prompt.isTemplate) throw new NotATemplateError(rawSlug);

    const version = await this.loadVersion(prompt.id, target);
    if (!version) return null;

    // Effective values: provided vars win; otherwise fall back to a
    // declared default (a declared default makes the var optional).
    const values: Record<string, string> = { ...vars };
    for (const name of version.templateVars) {
      if (values[name] === undefined) {
        const def = prompt.templateVarMeta[name]?.default;
        if (def !== undefined && def !== null) values[name] = def;
      }
    }

    if (version.type === "chat") {
      const result = renderChat(
        parseChatMessages(version.content),
        values,
        target.placeholders ?? {},
      );
      if (result.missingVars.length > 0) {
        throw new MissingTemplateVariablesError(result.missingVars);
      }
      return {
        type: "chat",
        content: null,
        messages: result.messages,
        config: version.config,
        version: version.versionNumber.value,
        varsUsed: result.varsUsed,
        missingVars: [],
      };
    }

    const expanded = await this.expandIncludes(
      ownerId,
      version.content,
      new Set([parsedSlug.value]),
      0,
    );
    const result = renderTemplate(expanded, values);
    if (result.missingVars.length > 0) {
      throw new MissingTemplateVariablesError(result.missingVars);
    }
    return {
      type: "text",
      content: result.content,
      messages: null,
      config: version.config,
      version: version.versionNumber.value,
      varsUsed: result.varsUsed,
      missingVars: [],
    };
  }

  /**
   * Recursively expands `{{>slug}}` includes against the owner's other
   * prompts (their current version). Cycles throw; unknown slugs and
   * over-depth references are left literal.
   */
  private async expandIncludes(
    ownerId: string,
    content: string,
    visited: ReadonlySet<string>,
    depth: number,
  ): Promise<string> {
    const includes = extractIncludes(content);
    if (includes.length === 0 || depth >= CONSTANTS.MAX_INCLUDE_DEPTH) {
      return content;
    }
    const resolved: Record<string, string> = {};
    for (const slug of includes) {
      if (visited.has(slug)) throw new PromptCompositionCycleError(slug);
      let parsed: Slug;
      try {
        parsed = Slug.parse(slug);
      } catch {
        continue;
      }
      const prompt = await this.promptRepo.findBySlug(ownerId, parsed);
      if (!prompt) continue;
      const version = await this.versionRepo.findCurrentForPrompt(prompt.id);
      if (!version || version.type !== "text") continue;
      resolved[slug] = await this.expandIncludes(
        ownerId,
        version.content,
        new Set([...visited, slug]),
        depth + 1,
      );
    }
    return applyIncludes(content, resolved);
  }

  private async loadVersion(
    promptId: string,
    target: RenderTarget,
  ): Promise<PromptVersion | null> {
    const { version, label } = target;
    if (label && label !== CONSTANTS.VIRTUAL_LATEST_LABEL) {
      const versionId = await this.labelRepo.findVersionIdByLabel(promptId, label);
      return versionId ? this.versionRepo.findById(versionId) : null;
    }
    if (version === undefined) {
      return this.versionRepo.findCurrentForPrompt(promptId);
    }
    let parsed: VersionNumber;
    try {
      parsed = VersionNumber.parse(version);
    } catch {
      return null;
    }
    return this.versionRepo.findByPromptIdAndNumber(promptId, parsed);
  }
}
