import { CONSTANTS } from "./constants";
import { InvalidApiKeyNameError } from "./api-key.errors";

export class ApiKeyName {
  private constructor(readonly value: string) {}

  static parse(input: string): ApiKeyName {
    const trimmed = input.trim();
    if (trimmed.length < CONSTANTS.NAME_MIN_LENGTH) {
      throw new InvalidApiKeyNameError("must not be empty");
    }
    if (trimmed.length > CONSTANTS.NAME_MAX_LENGTH) {
      throw new InvalidApiKeyNameError(
        `must be at most ${CONSTANTS.NAME_MAX_LENGTH} characters`,
      );
    }
    return new ApiKeyName(trimmed);
  }

  toString(): string {
    return this.value;
  }
}
