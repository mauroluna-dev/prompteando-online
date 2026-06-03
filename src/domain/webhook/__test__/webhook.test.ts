import { describe, expect, test } from "bun:test";
import {
  InvalidWebhookEventError,
  InvalidWebhookUrlError,
  Webhook,
} from "../index";

function make(url = "https://hooks.test/x", events: string[] = ["version.created"]) {
  return Webhook.create("w1", "u1", url, "secret", events, new Date());
}

describe("Webhook", () => {
  test("creates with valid url + events", () => {
    const w = make();
    expect(w.url).toBe("https://hooks.test/x");
    expect(w.events).toEqual(["version.created"]);
    expect(w.active).toBe(true);
  });

  test("rejects invalid url", () => {
    expect(() => make("mailto:x@y.com")).toThrow(InvalidWebhookUrlError);
    expect(() => make("not a url")).toThrow(InvalidWebhookUrlError);
  });

  test("rejects unknown / empty events", () => {
    expect(() => make("https://x.test", ["nope"])).toThrow(
      InvalidWebhookEventError,
    );
    expect(() => make("https://x.test", [])).toThrow(InvalidWebhookEventError);
  });

  test("subscribesTo respects active + event list", () => {
    const w = make("https://x.test", ["label.assigned"]);
    expect(w.subscribesTo("label.assigned")).toBe(true);
    expect(w.subscribesTo("version.created")).toBe(false);
  });

  test("toView omits the secret", () => {
    const view = make().toView();
    expect(view).not.toHaveProperty("secret");
  });
});
