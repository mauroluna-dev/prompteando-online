import { CONSTANTS } from "./constants";
import { InvalidPromptNameError } from "./prompt.errors";

export class PromptName {
  private constructor(readonly value: string) {}

  static parse(input: string): PromptName {
    const trimmed = input.trim();
    if (trimmed.length < CONSTANTS.NAME_MIN_LENGTH) {
      throw new InvalidPromptNameError("must not be empty");
    }
    if (trimmed.length > CONSTANTS.NAME_MAX_LENGTH) {
      throw new InvalidPromptNameError(
        `must be at most ${CONSTANTS.NAME_MAX_LENGTH} characters`,
      );
    }
    return new PromptName(trimmed);
  }

  toString(): string {
    return this.value;
  }
}
