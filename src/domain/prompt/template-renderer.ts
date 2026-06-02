import { CONSTANTS } from "./constants";
import { extractTemplateVariables } from "./template-parser";

export type RenderResult = {
  content: string;
  varsUsed: string[];
  missingVars: string[];
};

function has(values: Readonly<Record<string, string>>, name: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(values, name) &&
    values[name] !== undefined
  );
}

/**
 * Pure, total `{{var}}` substitution. Replaces every occurrence of a
 * variable present in `values`; variables without a value are left as
 * their literal `{{name}}` and reported in `missingVars`. This function
 * does NOT decide policy on missing vars — the caller (query) does.
 */
export function renderTemplate(
  content: string,
  values: Readonly<Record<string, string>>,
): RenderResult {
  const present = extractTemplateVariables(content);
  const varsUsed: string[] = [];
  const missingVars: string[] = [];
  for (const name of present) {
    (has(values, name) ? varsUsed : missingVars).push(name);
  }
  const rendered = content.replace(
    CONSTANTS.TEMPLATE_VAR_PATTERN,
    (whole: string, name: string) => {
      const value = values[name];
      return value !== undefined ? value : whole;
    },
  );
  return { content: rendered, varsUsed, missingVars };
}
