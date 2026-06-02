import { describe, expect, mock, test } from "bun:test";
import { PrompteandoClient, PrompteandoError } from "../src/index";

function jsonFetch(payload: unknown, status = 200): typeof fetch {
  return mock(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

const getResult = {
  content: "Hola {{nombre}}",
  version: 1,
  updatedAt: "2026-06-02T00:00:00Z",
  commitMessage: null,
  isTemplate: true,
  templateVars: ["nombre"],
  type: "text",
  config: { model: "claude-opus-4-8" },
};

describe("PrompteandoClient", () => {
  test("getPrompt fetches and caches", async () => {
    const f = jsonFetch(getResult);
    const client = new PrompteandoClient({
      apiKey: "po_live_x",
      baseUrl: "http://x",
      fetch: f,
    });
    const a = await client.getPrompt("greeting");
    const b = await client.getPrompt("greeting");
    expect(a.version).toBe(1);
    expect(b).toEqual(a);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  test("getPrompt falls back to last good value on 5xx", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify(getResult), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    }) as unknown as typeof fetch;
    const client = new PrompteandoClient({
      apiKey: "k",
      baseUrl: "http://x",
      cacheTtlMs: 0,
      fetch: f,
    });
    await client.getPrompt("greeting");
    const second = await client.getPrompt("greeting");
    expect(second.version).toBe(1); // served stale
  });

  test("render posts vars and returns the rendered DTO", async () => {
    const f = jsonFetch({
      type: "text",
      content: "Hola Ana",
      messages: null,
      config: {},
      version: 1,
      vars_used: ["nombre"],
      missing_vars: [],
    });
    const client = new PrompteandoClient({
      apiKey: "k",
      baseUrl: "http://x",
      fetch: f,
    });
    const r = await client.render("greeting", { vars: { nombre: "Ana" } });
    expect(r.content).toBe("Hola Ana");
  });

  test("throws PrompteandoError on 4xx", async () => {
    const f = jsonFetch({ error: "Missing variables" }, 422);
    const client = new PrompteandoClient({
      apiKey: "k",
      baseUrl: "http://x",
      fetch: f,
    });
    await expect(client.render("greeting")).rejects.toBeInstanceOf(
      PrompteandoError,
    );
  });
});
