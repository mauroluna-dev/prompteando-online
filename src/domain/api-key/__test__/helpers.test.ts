import { describe, test, expect } from "bun:test";
import {
  API_KEY_PLAINTEXT_LENGTH,
  API_KEY_PREFIX,
  API_KEY_PREFIX_LENGTH,
  extractApiKeyPrefix,
  generateApiKeyPlaintext,
} from "@/domain/api-key/helpers";

describe("generateApiKeyPlaintext", () => {
  test("starts with ps_live_", () => {
    const k = generateApiKeyPlaintext();
    expect(k.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  test("matches ps_live_<32 hex>", () => {
    const k = generateApiKeyPlaintext();
    expect(k).toMatch(/^ps_live_[a-f0-9]{32}$/);
  });

  test("has length 40", () => {
    expect(generateApiKeyPlaintext().length).toBe(API_KEY_PLAINTEXT_LENGTH);
  });

  test("returns different values across calls", () => {
    const a = generateApiKeyPlaintext();
    const b = generateApiKeyPlaintext();
    expect(a).not.toBe(b);
  });
});

describe("extractApiKeyPrefix", () => {
  test("returns first 16 chars", () => {
    const plaintext = "ps_live_a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(extractApiKeyPrefix(plaintext)).toBe("ps_live_a1b2c3d4");
    expect(extractApiKeyPrefix(plaintext).length).toBe(API_KEY_PREFIX_LENGTH);
  });

  test("matches ps_live_<8 hex>", () => {
    const k = generateApiKeyPlaintext();
    expect(extractApiKeyPrefix(k)).toMatch(/^ps_live_[a-f0-9]{8}$/);
  });
});
