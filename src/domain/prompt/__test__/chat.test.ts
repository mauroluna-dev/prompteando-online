import { describe, expect, test } from "bun:test";
import { InvalidChatContentError, InvalidPromptTypeError } from "../prompt.errors";
import {
  extractChatVariables,
  type ChatMessage,
  parseChatMessages,
  parsePromptType,
  renderChat,
  serializeChatMessages,
} from "../chat";

const sample: ChatMessage[] = [
  { role: "system", content: "Sos {{persona}}." },
  { role: "placeholder", name: "history" },
  { role: "user", content: "Hola, soy {{nombre}}." },
];

describe("chat", () => {
  test("parsePromptType validates", () => {
    expect(parsePromptType("chat")).toBe("chat");
    expect(() => parsePromptType("audio")).toThrow(InvalidPromptTypeError);
  });

  test("round-trips messages", () => {
    expect(parseChatMessages(serializeChatMessages(sample))).toEqual(sample);
  });

  test("rejects malformed content", () => {
    expect(() => parseChatMessages("{}")).toThrow(InvalidChatContentError);
    expect(() => parseChatMessages('[{"role":"nope"}]')).toThrow(
      InvalidChatContentError,
    );
    expect(() => parseChatMessages('[{"role":"placeholder"}]')).toThrow(
      InvalidChatContentError,
    );
  });

  test("extracts variables across messages", () => {
    expect(extractChatVariables(sample)).toEqual(["persona", "nombre"]);
  });

  test("renders, substitutes vars, and expands placeholders", () => {
    const r = renderChat(
      sample,
      { persona: "un asistente", nombre: "Ana" },
      { history: [{ role: "assistant", content: "previo" }] },
    );
    expect(r.missingVars).toEqual([]);
    expect(r.messages).toEqual([
      { role: "system", content: "Sos un asistente." },
      { role: "assistant", content: "previo" },
      { role: "user", content: "Hola, soy Ana." },
    ]);
  });

  test("reports missing variables", () => {
    const r = renderChat(sample, { persona: "x" });
    expect(r.missingVars).toEqual(["nombre"]);
  });
});
