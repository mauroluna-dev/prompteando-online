import { describe, expect, mock, test } from "bun:test";
import {
  FetchWebhookDeliverer,
  signPayload,
} from "../fetch-webhook-deliverer.adapter";
import { Webhook } from "@/domain/webhook";

function hook() {
  return Webhook.create(
    "w1",
    "u1",
    "https://hooks.test/x",
    "topsecret",
    ["version.created"],
    new Date(),
  );
}

describe("webhook delivery", () => {
  test("signPayload matches an independent HMAC and is deterministic", () => {
    const sig = signPayload("topsecret", "body");
    const independent = new Bun.CryptoHasher("sha256", "topsecret")
      .update("body")
      .digest("hex");
    expect(sig).toBe(independent);
    expect(signPayload("topsecret", "body")).toBe(sig);
  });

  test("POSTs signed payload with event headers", async () => {
    const holder: { url?: string; init?: RequestInit } = {};
    const f = mock(async (url: string, init: RequestInit) => {
      holder.url = url;
      holder.init = init;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    await new FetchWebhookDeliverer([], f).deliver(hook(), "version.created", {
      slug: "greeting",
    });

    const headers = (holder.init?.headers ?? {}) as Record<string, string>;
    expect(holder.url).toBe("https://hooks.test/x");
    expect(headers["x-prompteando-event"]).toBe("version.created");
    expect(headers["x-prompteando-signature"]).toStartWith("sha256=");
    expect(String(holder.init?.body ?? "")).toContain("greeting");
  });

  test("never throws on a failing endpoint (best-effort)", async () => {
    const f = mock(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    // backoffs=[] → no retries, no waiting
    await expect(
      new FetchWebhookDeliverer([], f).deliver(hook(), "version.created", {}),
    ).resolves.toBeUndefined();
  });
});
