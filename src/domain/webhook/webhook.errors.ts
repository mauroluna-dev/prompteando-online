export class InvalidWebhookUrlError extends Error {
  readonly code = "INVALID_WEBHOOK_URL" as const;
  constructor(value: string) {
    super(`Invalid webhook URL: "${value}"`);
    this.name = "InvalidWebhookUrlError";
  }
}

export class InvalidWebhookEventError extends Error {
  readonly code = "INVALID_WEBHOOK_EVENT" as const;
  constructor(value: string) {
    super(`Invalid webhook event: "${value}"`);
    this.name = "InvalidWebhookEventError";
  }
}

export class WebhookNotFoundError extends Error {
  readonly code = "WEBHOOK_NOT_FOUND" as const;
  constructor(id: string) {
    super(`Webhook not found: "${id}"`);
    this.name = "WebhookNotFoundError";
  }
}
