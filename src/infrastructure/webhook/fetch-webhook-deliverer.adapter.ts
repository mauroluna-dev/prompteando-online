import type { WebhookDeliverer } from "@/application/ports/webhook-deliverer.port";
import { CONSTANTS, type Webhook, type WebhookEvent } from "@/domain/webhook";

/** HMAC-SHA256 of the raw body, keyed by the webhook secret. */
export function signPayload(secret: string, body: string): string {
  return new Bun.CryptoHasher("sha256", secret).update(body).digest("hex");
}

export class FetchWebhookDeliverer implements WebhookDeliverer {
  constructor(
    private readonly backoffsMs: readonly number[] = CONSTANTS.RETRY_BACKOFFS_MS,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async deliver(
    webhook: Webhook,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify({ event, webhookId: webhook.id, data: payload });
    const headers = {
      "content-type": "application/json",
      "x-prompteando-event": event,
      "x-prompteando-signature": `sha256=${signPayload(webhook.secret, body)}`,
    };

    let attempt = 0;
    for (;;) {
      try {
        const res = await this.doFetch(webhook.url, {
          method: "POST",
          headers,
          body,
        });
        if (res.ok) return;
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (attempt >= this.backoffsMs.length) {
          console.error(`[webhook] delivery failed url=${webhook.url}`, err);
          return; // best-effort: never throws into the caller
        }
        await Bun.sleep(this.backoffsMs[attempt] ?? 1000);
        attempt++;
      }
    }
  }
}
