import { describe, test, expect } from "bun:test";
import { ApiKeyPlaintext } from "@/domain/api-key/api-key-plaintext.vo";
import { CONSTANTS } from "@/domain/api-key/constants";
import { InvalidApiKeyError } from "@/domain/api-key/api-key.errors";

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

describe("ApiKeyPlaintext.fromRandomBytes", () => {
  test("starts with prefix", () => {
    const k = ApiKeyPlaintext.fromRandomBytes(randomBytes(CONSTANTS.RANDOM_BYTES));
    expect(k.value.startsWith(CONSTANTS.PREFIX)).toBe(true);
  });

  test("matches ps_live_<32 hex>", () => {
    const k = ApiKeyPlaintext.fromRandomBytes(randomBytes(CONSTANTS.RANDOM_BYTES));
    expect(k.value).toMatch(/^ps_live_[a-f0-9]{32}$/);
  });

  test("has full plaintext length", () => {
    const k = ApiKeyPlaintext.fromRandomBytes(randomBytes(CONSTANTS.RANDOM_BYTES));
    expect(k.value.length).toBe(CONSTANTS.PLAINTEXT_LENGTH);
  });

  test("returns different values across calls", () => {
    const a = ApiKeyPlaintext.fromRandomBytes(randomBytes(CONSTANTS.RANDOM_BYTES));
    const b = ApiKeyPlaintext.fromRandomBytes(randomBytes(CONSTANTS.RANDOM_BYTES));
    expect(a.value).not.toBe(b.value);
  });

  test("rejects wrong-length bytes", () => {
    expect(() => ApiKeyPlaintext.fromRandomBytes(randomBytes(8))).toThrow(
      InvalidApiKeyError,
    );
  });
});

describe("ApiKeyPlaintext.parse", () => {
  test("accepts a valid plaintext", () => {
    const raw = "ps_live_a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(ApiKeyPlaintext.parse(raw).value).toBe(raw);
  });

  test("rejects malformed", () => {
    expect(() => ApiKeyPlaintext.parse("not-a-key")).toThrow(InvalidApiKeyError);
  });
});

describe("extractPrefix", () => {
  test("returns first PREFIX_LENGTH chars", () => {
    const k = ApiKeyPlaintext.parse("ps_live_a1b2c3d4e5f60718293a4b5c6d7e8f90");
    expect(k.extractPrefix()).toBe("ps_live_a1b2c3d4");
    expect(k.extractPrefix().length).toBe(CONSTANTS.PREFIX_LENGTH);
  });
});
