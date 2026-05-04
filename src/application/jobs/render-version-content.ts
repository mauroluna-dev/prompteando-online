import type { Prompt } from "@/domain/prompt";
import type { PromptVersion } from "@/domain/prompt-version";

/**
 * Serialize a `PromptVersion` as a markdown file with a YAML
 * frontmatter block. The output is what gets committed to the
 * user's GitHub repo at `prompts/<slug>.md`.
 */
export function renderVersionContent(
  prompt: Prompt,
  version: PromptVersion,
): string {
  const lines = [
    `prompt_name: ${yamlScalar(prompt.name.value)}`,
    `slug: ${yamlScalar(prompt.slug.value)}`,
    `version: ${version.versionNumber.value}`,
  ];
  if (version.commitMessage) {
    lines.push(`commit_message: ${yamlScalar(version.commitMessage)}`);
  }
  lines.push(`updated_at: ${version.createdAt.toISOString()}`);
  const body = ensureTrailingNewline(version.content);
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

const YAML_AMBIGUOUS = /[:#&*!|>'"%@`,[\]{}]/;
const YAML_EDGE_WHITESPACE = /^\s|\s$/;

function yamlScalar(value: string): string {
  if (value.length === 0) return '""';
  if (YAML_AMBIGUOUS.test(value) || YAML_EDGE_WHITESPACE.test(value)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}
