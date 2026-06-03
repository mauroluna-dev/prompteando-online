import { and, eq, sql } from "drizzle-orm";
import type { WebhookRepository } from "@/application/ports/webhook-repository.port";
import type { DB } from "@/infrastructure/persistence/db";
import { webhooks } from "@/infrastructure/persistence/schema";
import { Webhook, type WebhookEvent } from "@/domain/webhook";

export class PostgresWebhookRepository implements WebhookRepository {
  constructor(private readonly db: DB) {}

  async save(webhook: Webhook): Promise<void> {
    await this.db
      .insert(webhooks)
      .values({
        id: webhook.id,
        userId: webhook.userId,
        url: webhook.url,
        secret: webhook.secret,
        events: webhook.events,
        active: webhook.active,
        createdAt: webhook.createdAt,
      })
      .onConflictDoUpdate({
        target: webhooks.id,
        set: {
          url: webhook.url,
          events: webhook.events,
          active: webhook.active,
        },
      });
  }

  async findById(id: string): Promise<Webhook | null> {
    const rows = await this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, id))
      .limit(1);
    return rows[0] ? Webhook.fromRow(rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Webhook[]> {
    const rows = await this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, userId));
    return rows.map((r) => Webhook.fromRow(r));
  }

  async findActiveByUserAndEvent(
    userId: string,
    event: WebhookEvent,
  ): Promise<Webhook[]> {
    const rows = await this.db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.userId, userId),
          eq(webhooks.active, true),
          sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`,
        ),
      );
    return rows.map((r) => Webhook.fromRow(r));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.db
      .delete(webhooks)
      .where(and(eq(webhooks.userId, userId), eq(webhooks.id, id)))
      .returning({ id: webhooks.id });
    return result.length > 0;
  }
}
