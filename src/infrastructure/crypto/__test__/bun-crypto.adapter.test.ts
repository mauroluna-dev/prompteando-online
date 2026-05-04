import { describe, expect, test } from "bun:test";
import { BunCryptoAdapter } from "@/infrastructure/crypto/bun-crypto.adapter";

const adapter = new BunCryptoAdapter();

describe("BunCryptoAdapter.encrypt/decrypt", () => {
  test("roundtrip preserves the plaintext (short)", () => {
    const plain = "hello";
    expect(adapter.decrypt(adapter.encrypt(plain))).toBe(plain);
  });

  test("roundtrip preserves the plaintext (typical GitHub token)", () => {
    const plain = "gho_" + "a".repeat(36);
    expect(adapter.decrypt(adapter.encrypt(plain))).toBe(plain);
  });

  test("roundtrip preserves the plaintext (1KB blob)", () => {
    const plain = "x".repeat(1024);
    expect(adapter.decrypt(adapter.encrypt(plain))).toBe(plain);
  });

  test("same plaintext produces different ciphertexts (random IV)", () => {
    const plain = "deterministic";
    const a = adapter.encrypt(plain);
    const b = adapter.encrypt(plain);
    expect(a).not.toBe(b);
  });

  test("ciphertext output has the <iv>:<ct>:<tag> shape", () => {
    const ct = adapter.encrypt("anything");
    const parts = ct.split(":");
    expect(parts.length).toBe(3);
    for (const p of parts) {
      // base64 decodes without throwing
      expect(() => Buffer.from(p, "base64")).not.toThrow();
    }
  });

  test("tampering the ciphertext segment causes decrypt to throw", () => {
    const ct = adapter.encrypt("payload");
    const [iv, ctBody, tag] = ct.split(":") as [string, string, string];
    const tampered = `${iv}:${Buffer.from("0".repeat(ctBody.length)).toString("base64")}:${tag}`;
    expect(() => adapter.decrypt(tampered)).toThrow();
  });

  test("tampering the auth tag causes decrypt to throw", () => {
    const ct = adapter.encrypt("payload");
    const [iv, ctBody, tag] = ct.split(":") as [string, string, string];
    const tamperedTag = Buffer.from(
      Buffer.from(tag, "base64").map((b) => b ^ 0xff),
    ).toString("base64");
    const tampered = `${iv}:${ctBody}:${tamperedTag}`;
    expect(() => adapter.decrypt(tampered)).toThrow();
  });

  test("malformed ciphertext (wrong segment count) throws", () => {
    expect(() => adapter.decrypt("only-two:segments")).toThrow();
    expect(() => adapter.decrypt("a:b:c:d")).toThrow();
  });
});
