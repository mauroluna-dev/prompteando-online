import { InvalidPromptNameError } from "./errors";

declare const __brand: unique symbol;
export type PromptName = string & { readonly [__brand]: "PromptName" };

const MIN_LENGTH = 1;
const MAX_LENGTH = 100;

export function parsePromptName(input: string): PromptName {
  const trimmed = input.trim();
  if (trimmed.length < MIN_LENGTH) {
    throw new InvalidPromptNameError("must not be empty");
  }
  if (trimmed.length > MAX_LENGTH) {
    throw new InvalidPromptNameError(`must be at most ${MAX_LENGTH} characters`);
  }
  return trimmed as PromptName;
}
