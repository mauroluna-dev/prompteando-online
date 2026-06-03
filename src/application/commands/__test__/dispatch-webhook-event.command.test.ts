import { describe, expect, test } from "bun:test";
import { DispatchWebhookEventCommand } from "@/application/commands/dispatch-webhook-event.command";
import type { WebhookDeliverer } from "@/application/ports/webhook-deliverer.port";
import type { WebhookRepository } from "@/application/ports/webhook-repository.port";
import { Webhook } from "@/domain/webhook";

function hook(id: string) {
  return Webhook.create(
    id,
    "u1",
    "https://hooks.test/x",
    "s",
    ["version.created"],
    new Date(),
  );
}

describe("DispatchWebhookEventCommand", () => {
  test("delivers to every subscribed webhook", async () => {
    const delivered: string[] = [];
    const repo = {
      findActiveByUserAndEvent: async () => [hook("a"), hook("b")],
    } as unknown as WebhookRepository;
    const deliverer: WebhookDeliverer = {
      deliver: async (w) => {
        delivered.push(w.id);
      },
    };
    await new DispatchWebhookEventCommand(repo, deliverer).execute(
      "u1",
      "version.created",
      { slug: "x" },
    );
    // deliveries are fire-and-forget; yield once so they run
    await Promise.resolve();
    expect(delivered.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "a",
      "b",
    ]);
  });

  test("swallows a deliverer failure", async () => {
    const repo = {
      findActiveByUserAndEvent: async () => [hook("a")],
    } as unknown as WebhookRepository;
    const deliverer: WebhookDeliverer = {
      deliver: async () => {
        throw new Error("down");
      },
    };
    await expect(
      new DispatchWebhookEventCommand(repo, deliverer).execute(
        "u1",
        "version.created",
        {},
      ),
    ).resolves.toBeUndefined();
  });
});
