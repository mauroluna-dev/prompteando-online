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

export class InvalidLabelError extends Error {
  readonly code = "INVALID_LABEL" as const;
  constructor(value: string) {
    super(`Invalid label: "${value}"`);
    this.name = "InvalidLabelError";
  }
}

export class CannotAssignVirtualLabelError extends Error {
  readonly code = "CANNOT_ASSIGN_VIRTUAL_LABEL" as const;
  constructor(label: string) {
    super(`"${label}" is a virtual label and cannot be assigned manually`);
    this.name = "CannotAssignVirtualLabelError";
  }
}

export class LabelNotFoundError extends Error {
  readonly code = "LABEL_NOT_FOUND" as const;
  constructor(label: string) {
    super(`Label not found: "${label}"`);
    this.name = "LabelNotFoundError";
  }
}

export class InvalidPromptTypeError extends Error {
  readonly code = "INVALID_PROMPT_TYPE" as const;
  constructor(value: string) {
    super(`Invalid prompt type: "${value}"`);
    this.name = "InvalidPromptTypeError";
  }
}

export class InvalidChatContentError extends Error {
  readonly code = "INVALID_CHAT_CONTENT" as const;
  constructor(reason: string) {
    super(`Invalid chat content: ${reason}`);
    this.name = "InvalidChatContentError";
  }
}

export class PromptCompositionCycleError extends Error {
  readonly code = "PROMPT_COMPOSITION_CYCLE" as const;
  constructor(slug: string) {
    super(`Prompt composition cycle detected at "${slug}"`);
    this.name = "PromptCompositionCycleError";
  }
}
