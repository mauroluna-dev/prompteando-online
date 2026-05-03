import { describe, test, expect } from "bun:test";
import { ApiKeyName } from "@/domain/api-key/api-key-name.vo";
import { InvalidApiKeyNameError } from "@/domain/api-key/api-key.errors";

describe("ApiKeyName.parse", () => {
  test("trims and accepts a normal name", () => {
    expect(ApiKeyName.parse("  n8n prod  ").value).toBe("n8n prod");
  });

  test("rejects empty string", () => {
    expect(() => ApiKeyName.parse("")).toThrow(InvalidApiKeyNameError);
  });

  test("rejects whitespace-only", () => {
    expect(() => ApiKeyName.parse("   ")).toThrow(InvalidApiKeyNameError);
  });

  test("accepts 50 chars", () => {
    expect(ApiKeyName.parse("x".repeat(50)).value).toBe("x".repeat(50));
  });

  test("rejects 51 chars", () => {
    expect(() => ApiKeyName.parse("x".repeat(51))).toThrow(
      InvalidApiKeyNameError,
    );
  });
});
