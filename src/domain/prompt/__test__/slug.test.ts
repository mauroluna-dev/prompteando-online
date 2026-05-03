import { describe, test, expect } from "bun:test";
import { Slug } from "@/domain/prompt/slug.vo";
import { InvalidSlugError } from "@/domain/prompt/prompt.errors";

describe("Slug.generate", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(Slug.generate("My Prompt").value).toBe("my-prompt");
  });

  test("strips emojis and special chars", () => {
    expect(Slug.generate("MARKET 2024 🚀").value).toBe("market-2024");
  });

  test("collapses multiple separators", () => {
    expect(Slug.generate("Hello   World___test").value).toBe("hello-world-test");
  });

  test("trims leading/trailing hyphens", () => {
    expect(Slug.generate("---weird-name---").value).toBe("weird-name");
  });

  test("falls back to 'prompt' when input cleans to empty", () => {
    expect(Slug.generate("   ").value).toBe("prompt");
    expect(Slug.generate("🚀🎉").value).toBe("prompt");
  });

  test("truncates to 60 chars", () => {
    const long = "a".repeat(120);
    const result = Slug.generate(long);
    expect(result.value.length).toBeLessThanOrEqual(60);
  });

  test("preserves single-word lowercase input", () => {
    expect(Slug.generate("simple").value).toBe("simple");
  });
});

describe("Slug.parse", () => {
  test("accepts valid slug", () => {
    expect(Slug.parse("my-prompt-2").value).toBe("my-prompt-2");
  });

  test("rejects uppercase", () => {
    expect(() => Slug.parse("My-Prompt")).toThrow(InvalidSlugError);
  });

  test("rejects spaces", () => {
    expect(() => Slug.parse("my prompt")).toThrow(InvalidSlugError);
  });

  test("rejects empty string", () => {
    expect(() => Slug.parse("")).toThrow(InvalidSlugError);
  });

  test("rejects leading hyphen", () => {
    expect(() => Slug.parse("-foo")).toThrow(InvalidSlugError);
  });
});
