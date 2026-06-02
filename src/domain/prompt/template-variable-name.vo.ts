import { CONSTANTS } from "./constants";
import { InvalidTemplateVariableNameError } from "./prompt.errors";

/**
 * A `{{var}}` identifier. Matches the parser's capture group:
 * `[a-zA-Z0-9_]+`, bounded to MAX_VAR_NAME_LENGTH.
 */
export class TemplateVariableName {
  private constructor(readonly value: string) {}

  static parse(input: string): TemplateVariableName {
    if (
      input.length === 0 ||
      input.length > CONSTANTS.MAX_VAR_NAME_LENGTH ||
      !CONSTANTS.TEMPLATE_VAR_NAME_PATTERN.test(input)
    ) {
      throw new InvalidTemplateVariableNameError(input);
    }
    return new TemplateVariableName(input);
  }

  equals(other: TemplateVariableName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
