import type { Webhook, WebhookEvent } from "@/domain/webhook";

export interface WebhookDeliverer {
  /** Signs + POSTs the payload to the webhook URL (with retries). */
  deliver(
    webhook: Webhook,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
