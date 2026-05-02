import { describe, test, expect } from "bun:test";
import { parseApiKeyName } from "@/domain/api-key/api-key-name";
import { InvalidApiKeyNameError } from "@/domain/api-key/errors";

describe("parseApiKeyName", () => {
  test("trims and accepts a normal name", () => {
    expect<string>(parseApiKeyName("  n8n prod  ")).toBe("n8n prod");
  });

  test("rejects empty string", () => {
    expect(() => parseApiKeyName("")).toThrow(InvalidApiKeyNameError);
  });

  test("rejects whitespace-only", () => {
    expect(() => parseApiKeyName("   ")).toThrow(InvalidApiKeyNameError);
  });

  test("accepts 50 chars", () => {
    expect<string>(parseApiKeyName("x".repeat(50))).toBe("x".repeat(50));
  });

  test("rejects 51 chars", () => {
    expect(() => parseApiKeyName("x".repeat(51))).toThrow(
      InvalidApiKeyNameError,
    );
  });
});
