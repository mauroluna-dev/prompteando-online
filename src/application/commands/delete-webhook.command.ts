import type { WebhookRepository } from "@/application/ports/webhook-repository.port";
import { WebhookNotFoundError } from "@/domain/webhook";

export class DeleteWebhookCommand {
  constructor(private readonly repo: WebhookRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const removed = await this.repo.delete(userId, id);
    if (!removed) throw new WebhookNotFoundError(id);
  }
}
