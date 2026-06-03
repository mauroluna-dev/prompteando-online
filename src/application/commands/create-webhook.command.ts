import type { CryptoPort } from "@/application/ports/crypto.port";
import type { WebhookRepository } from "@/application/ports/webhook-repository.port";
import { CONSTANTS, Webhook } from "@/domain/webhook";

export class CreateWebhookCommand {
  constructor(
    private readonly repo: WebhookRepository,
    private readonly crypto: CryptoPort,
  ) {}

  /** Generates the signing secret and persists the webhook. */
  async execute(userId: string, url: string, events: string[]): Promise<Webhook> {
    const secret = Buffer.from(
      this.crypto.randomBytes(CONSTANTS.SECRET_BYTES),
    ).toString("hex");
    const webhook = Webhook.create(
      this.crypto.randomUUID(),
      userId,
      url,
      secret,
      events,
      new Date(),
    );
    await this.repo.save(webhook);
    return webhook;
  }
}
