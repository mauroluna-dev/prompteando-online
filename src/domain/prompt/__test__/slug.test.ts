import { describe, test, expect } from "bun:test";
import { generateSlug, parseSlug } from "@/domain/prompt/slug";
import { InvalidSlugError } from "@/domain/prompt/errors";

describe("generateSlug", () => {
  test("lowercases and hyphenates spaces", () => {
    expect<string>(generateSlug("My Prompt")).toBe("my-prompt");
  });

  test("strips emojis and special chars", () => {
    expect<string>(generateSlug("MARKET 2024 🚀")).toBe("market-2024");
  });

  test("collapses multiple separators", () => {
    expect<string>(generateSlug("Hello   World___test")).toBe("hello-world-test");
  });

  test("trims leading/trailing hyphens", () => {
    expect<string>(generateSlug("---weird-name---")).toBe("weird-name");
  });

  test("falls back to 'prompt' when input cleans to empty", () => {
    expect<string>(generateSlug("   ")).toBe("prompt");
    expect<string>(generateSlug("🚀🎉")).toBe("prompt");
  });

  test("truncates to 60 chars", () => {
    const long = "a".repeat(120);
    const result = generateSlug(long);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  test("preserves single-word lowercase input", () => {
    expect<string>(generateSlug("simple")).toBe("simple");
  });
});

describe("parseSlug", () => {
  test("accepts valid slug", () => {
    expect<string>(parseSlug("my-prompt-2")).toBe("my-prompt-2");
  });

  test("rejects uppercase", () => {
    expect(() => parseSlug("My-Prompt")).toThrow(InvalidSlugError);
  });

  test("rejects spaces", () => {
    expect(() => parseSlug("my prompt")).toThrow(InvalidSlugError);
  });

  test("rejects empty string", () => {
    expect(() => parseSlug("")).toThrow(InvalidSlugError);
  });

  test("rejects leading hyphen", () => {
    expect(() => parseSlug("-foo")).toThrow(InvalidSlugError);
  });
});
