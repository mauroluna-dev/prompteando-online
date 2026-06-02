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

export class InvalidTemplateVariableNameError extends Error {
  readonly code = "INVALID_TEMPLATE_VARIABLE_NAME" as const;
  constructor(value: string) {
    super(`Invalid template variable name: "${value}"`);
    this.name = "InvalidTemplateVariableNameError";
  }
}

export class TooManyTemplateVariablesError extends Error {
  readonly code = "TOO_MANY_TEMPLATE_VARIABLES" as const;
  constructor(max: number) {
    super(`Template exceeds ${max} variables`);
    this.name = "TooManyTemplateVariablesError";
  }
}

export class NotATemplateError extends Error {
  readonly code = "NOT_A_TEMPLATE" as const;
  constructor(slug: string) {
    super(`Prompt is not a template: "${slug}"`);
    this.name = "NotATemplateError";
  }
}

export class MissingTemplateVariablesError extends Error {
  readonly code = "MISSING_TEMPLATE_VARIABLES" as const;
  constructor(readonly missingVars: string[]) {
    super(`Missing template variables: ${missingVars.join(", ")}`);
    this.name = "MissingTemplateVariablesError";
  }
}
