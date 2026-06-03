import type { WebhookRepository } from "@/application/ports/webhook-repository.port";
import type { WebhookEvent } from "@/domain/webhook";

export type WebhookView = {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: Date;
};

export class ListWebhooksQuery {
  constructor(private readonly repo: WebhookRepository) {}

  async execute(userId: string): Promise<WebhookView[]> {
    const hooks = await this.repo.findByUserId(userId);
    return hooks.map((w) => w.toView());
  }
}
