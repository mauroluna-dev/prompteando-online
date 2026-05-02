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
