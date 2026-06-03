import type { WebhookDeliverer } from "@/application/ports/webhook-deliverer.port";
import type { WebhookRepository } from "@/application/ports/webhook-repository.port";
import type { WebhookEvent } from "@/domain/webhook";

/**
 * Fans out an event to every active webhook subscribed to it. Deliveries
 * are best-effort and fire-and-forget (the deliverer retries + swallows
 * failures); execute resolves once they are kicked off.
 */
export class DispatchWebhookEventCommand {
  constructor(
    private readonly repo: WebhookRepository,
    private readonly deliverer: WebhookDeliverer,
  ) {}

  async execute(
    userId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const hooks = await this.repo.findActiveByUserAndEvent(userId, event);
    for (const hook of hooks) {
      void this.deliverer.deliver(hook, event, payload).catch((err: unknown) => {
        console.error(`[webhook-dispatch] ${hook.id}`, err);
      });
    }
  }
}
