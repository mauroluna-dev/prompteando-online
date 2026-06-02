export const CONSTANTS = {
  MAX_DESCRIPTION_LENGTH: 500,
  SLUG_MAX_LENGTH: 60,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  // Template variables (P19). Logic-less `{{var}}` substitution.
  // Global flag is safe to share: matchAll clones the regex and
  // String.replace resets lastIndex.
  TEMPLATE_VAR_PATTERN: /\{\{\s*(\w+)\s*\}\}/g,
  TEMPLATE_VAR_NAME_PATTERN: /^\w+$/,
  MAX_TEMPLATE_VARS: 50,
  MAX_VAR_NAME_LENGTH: 64,
  MAX_VAR_VALUE_LENGTH: 10_000,
} as const;
