import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import type { VersionRepository } from "@/application/ports/version-repository.port";
import {
  MissingTemplateVariablesError,
  NotATemplateError,
  renderTemplate,
  Slug,
} from "@/domain/prompt";
import {
  type RenderedPromptDTO,
  VersionNumber,
} from "@/domain/prompt-version";

/**
 * Renders a template prompt by substituting `{{var}}` with the provided
 * values. Strict: throws MissingTemplateVariablesError (→ 422) if any
 * required variable has neither a provided value nor a declared default.
 * Returns `null` when the prompt/version does not exist (→ 404).
 */
export class RenderPromptVersionQuery {
  constructor(
    private readonly promptRepo: PromptRepository,
    private readonly versionRepo: VersionRepository,
  ) {}

  async execute(
    ownerId: string,
    rawSlug: string,
    vars: Readonly<Record<string, string>>,
    version?: number,
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

    const target = await this.loadVersion(prompt.id, version);
    if (!target) return null;

    // Effective values: provided vars win; otherwise fall back to a
    // declared default (a declared default makes the var optional).
    const values: Record<string, string> = { ...vars };
    for (const name of target.templateVars) {
      if (values[name] === undefined) {
        const def = prompt.templateVarMeta[name]?.default;
        if (def !== undefined && def !== null) values[name] = def;
      }
    }

    const result = renderTemplate(target.content, values);
    if (result.missingVars.length > 0) {
      throw new MissingTemplateVariablesError(result.missingVars);
    }

    return {
      content: result.content,
      version: target.versionNumber.value,
      varsUsed: result.varsUsed,
      missingVars: [],
    };
  }

  private async loadVersion(promptId: string, version?: number) {
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
