import { InvalidApiKeyNameError } from "./errors";

declare const __brand: unique symbol;
export type ApiKeyName = string & { readonly [__brand]: "ApiKeyName" };

const MIN_LENGTH = 1;
const MAX_LENGTH = 50;

export function parseApiKeyName(input: string): ApiKeyName {
  const trimmed = input.trim();
  if (trimmed.length < MIN_LENGTH) {
    throw new InvalidApiKeyNameError("must not be empty");
  }
  if (trimmed.length > MAX_LENGTH) {
    throw new InvalidApiKeyNameError(
      `must be at most ${MAX_LENGTH} characters`,
    );
  }
  return trimmed as ApiKeyName;
}
