export class InvalidSlugError extends Error {
  readonly code = "INVALID_SLUG" as const;
  constructor(value: string) {
    super(`Invalid slug: "${value}"`);
    this.name = "InvalidSlugError";
  }
}

export class InvalidPromptNameError extends Error {
  readonly code = "INVALID_PROMPT_NAME" as const;
  constructor(reason: string) {
    super(`Invalid prompt name: ${reason}`);
    this.name = "InvalidPromptNameError";
  }
}

export class PromptDescriptionTooLongError extends Error {
  readonly code = "PROMPT_DESCRIPTION_TOO_LONG" as const;
  constructor(maxLength: number) {
    super(`Description exceeds ${maxLength} characters`);
    this.name = "PromptDescriptionTooLongError";
  }
}

export class PromptNotFoundError extends Error {
  readonly code = "PROMPT_NOT_FOUND" as const;
  constructor(slug: string) {
    super(`Prompt not found: "${slug}"`);
    this.name = "PromptNotFoundError";
  }
}
