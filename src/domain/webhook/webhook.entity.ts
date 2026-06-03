import { CONSTANTS } from "./constants";
import {
  InvalidWebhookEventError,
  InvalidWebhookUrlError,
} from "./webhook.errors";

export type WebhookEvent = (typeof CONSTANTS.EVENTS)[number];

export function parseWebhookEvent(value: string): WebhookEvent {
  if ((CONSTANTS.EVENTS as readonly string[]).includes(value)) {
    return value as WebhookEvent;
  }
  throw new InvalidWebhookEventError(value);
}

export type WebhookRow = {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: Date;
};

export class Webhook {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly url: string,
    readonly secret: string,
    readonly events: WebhookEvent[],
    readonly active: boolean,
    readonly createdAt: Date,
  ) {}

  static create(
    id: string,
    userId: string,
    url: string,
    secret: string,
    events: string[],
    now: Date,
  ): Webhook {
    return new Webhook(
      id,
      userId,
      Webhook.assertUrl(url),
      secret,
      Webhook.assertEvents(events),
      true,
      now,
    );
  }

  static fromRow(row: WebhookRow): Webhook {
    return new Webhook(
      row.id,
      row.userId,
      row.url,
      row.secret,
      row.events,
      row.active,
      row.createdAt,
    );
  }

  subscribesTo(event: WebhookEvent): boolean {
    return this.active && this.events.includes(event);
  }

  /** Secret-free view for listing in the dashboard. */
  toView(): {
    id: string;
    url: string;
    events: WebhookEvent[];
    active: boolean;
    createdAt: Date;
  } {
    return {
      id: this.id,
      url: this.url,
      events: this.events,
      active: this.active,
      createdAt: this.createdAt,
    };
  }

  private static assertUrl(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new InvalidWebhookUrlError(url);
    }
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      url.length > CONSTANTS.MAX_URL_LENGTH
    ) {
      throw new InvalidWebhookUrlError(url);
    }
    return url;
  }

  private static assertEvents(events: string[]): WebhookEvent[] {
    if (events.length === 0) throw new InvalidWebhookEventError("(empty)");
    return events.map(parseWebhookEvent);
  }
}
