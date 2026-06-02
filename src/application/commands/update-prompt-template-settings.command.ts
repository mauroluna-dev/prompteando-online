import type { PromptRepository } from "@/application/ports/prompt-repository.port";
import {
  type Prompt,
  PromptNotFoundError,
  Slug,
  type TemplateVarMeta,
  TemplateVariableName,
} from "@/domain/prompt";

export type TemplateSettings = {
  isTemplate?: boolean;
  varMeta?: TemplateVarMeta;
};

/**
 * Toggles `is_template` and/or replaces the prompt-level template
 * variable metadata. Session-auth (dashboard), not API key.
 */
export class UpdatePromptTemplateSettingsCommand {
  constructor(private readonly promptRepo: PromptRepository) {}

  async execute(
    userId: string,
    rawSlug: string,
    settings: TemplateSettings,
  ): Promise<Prompt> {
    const slug = Slug.parse(rawSlug);
    const prompt = await this.promptRepo.findBySlug(userId, slug);
    if (!prompt) throw new PromptNotFoundError(rawSlug);

    const now = new Date();
    if (settings.varMeta !== undefined) {
      // Invariant: every meta key is a valid `{{var}}` name.
      for (const key of Object.keys(settings.varMeta)) {
        TemplateVariableName.parse(key);
      }
      prompt.replaceVarMeta(settings.varMeta, now);
    }
    if (settings.isTemplate !== undefined) {
      prompt.setTemplateMode(settings.isTemplate, now);
    }

    await this.promptRepo.save(prompt);
    return prompt;
  }
}
