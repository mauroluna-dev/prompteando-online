export class InvalidApiKeyNameError extends Error {
  readonly code = "INVALID_API_KEY_NAME" as const;
  constructor(reason: string) {
    super(`Invalid API key name: ${reason}`);
    this.name = "InvalidApiKeyNameError";
  }
}

export class ApiKeyNotFoundError extends Error {
  readonly code = "API_KEY_NOT_FOUND" as const;
  constructor(id: string) {
    super(`API key not found: ${id}`);
    this.name = "ApiKeyNotFoundError";
  }
}

export class ApiKeyQuotaExceededError extends Error {
  readonly code = "API_KEY_QUOTA_EXCEEDED" as const;
  constructor(readonly limit: number) {
    super(`API key quota exceeded (max ${limit} active keys)`);
    this.name = "ApiKeyQuotaExceededError";
  }
}

export class ApiKeyAlreadyRevokedError extends Error {
  readonly code = "API_KEY_ALREADY_REVOKED" as const;
  constructor(id: string) {
    super(`API key already revoked: ${id}`);
    this.name = "ApiKeyAlreadyRevokedError";
  }
}

/**
 * Public API authentication errors. Both map to a unified
 * 401 response so the body never leaks why auth failed.
 */
export class MissingAuthorizationHeaderError extends Error {
  readonly code = "MISSING_AUTHORIZATION_HEADER" as const;
  constructor() {
    super("Missing or malformed Authorization header");
    this.name = "MissingAuthorizationHeaderError";
  }
}

export class InvalidApiKeyError extends Error {
  readonly code = "INVALID_API_KEY" as const;
  constructor(reason: string) {
    super(`Invalid API key: ${reason}`);
    this.name = "InvalidApiKeyError";
  }
}

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED" as const;
  constructor(readonly retryAfter: number) {
    super(`Rate limit exceeded; retry after ${retryAfter}s`);
    this.name = "RateLimitExceededError";
  }
}

export class InvalidMetricsRangeError extends Error {
  readonly code = "INVALID_METRICS_RANGE" as const;
  constructor(value: string) {
    super(`Invalid metrics range "${value}". Expected one of: 7d, 30d, 90d.`);
    this.name = "InvalidMetricsRangeError";
  }
}
