import { CONSTANTS } from "./constants";
import { TooManyTemplateVariablesError } from "./prompt.errors";

/**
 * Extracts the `{{var}}` variable names present in `content`, deduped
 * and in order of first appearance. Throws if the template declares
 * more than MAX_TEMPLATE_VARS distinct variables (anti-abuse).
 */
export function extractTemplateVariables(content: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of content.matchAll(CONSTANTS.TEMPLATE_VAR_PATTERN)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  if (ordered.length > CONSTANTS.MAX_TEMPLATE_VARS) {
    throw new TooManyTemplateVariablesError(CONSTANTS.MAX_TEMPLATE_VARS);
  }
  return ordered;
}
