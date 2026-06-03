import type { Webhook, WebhookEvent } from "@/domain/webhook";

export interface WebhookRepository {
  save(webhook: Webhook): Promise<void>;
  findById(id: string): Promise<Webhook | null>;
  findByUserId(userId: string): Promise<Webhook[]>;
  findActiveByUserAndEvent(
    userId: string,
    event: WebhookEvent,
  ): Promise<Webhook[]>;
  delete(userId: string, id: string): Promise<boolean>;
}
