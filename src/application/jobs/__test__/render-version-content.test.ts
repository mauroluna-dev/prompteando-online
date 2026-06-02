import { describe, expect, test } from "bun:test";
import { Prompt, PromptName, Slug } from "@/domain/prompt";
import { PromptVersion, VersionNumber } from "@/domain/prompt-version";
import {
  renderVersionContent,
  renderVersionContentRaw,
} from "../render-version-content";

function makePrompt(name: string, slug: string): Prompt {
  return Prompt.create(
    "p1",
    "u1",
    PromptName.parse(name),
    Slug.parse(slug),
    null,
    new Date("2026-05-03T12:00:00Z"),
  );
}

function makeVersion(
  num: number,
  content: string,
  commitMessage: string | null,
): PromptVersion {
  return PromptVersion.create(
    `v${num}`,
    "p1",
    VersionNumber.parse(num),
    "text",
    content,
    commitMessage,
    [],
    new Date("2026-05-03T20:30:00Z"),
  );
}

describe("renderVersionContent", () => {
  test("typical case produces well-formed frontmatter and body", () => {
    const prompt = makePrompt("My Prompt", "my-prompt");
    const version = makeVersion(4, "Hello world\n", "Tweaked the system message");
    const out = renderVersionContent(prompt, version);
    expect(out).toBe(
      [
        "---",
        "prompt_name: My Prompt",
        "slug: my-prompt",
        "version: 4",
        "commit_message: Tweaked the system message",
        "updated_at: 2026-05-03T20:30:00.000Z",
        "---",
        "",
        "Hello world",
        "",
      ].join("\n"),
    );
  });

  test("ambiguous YAML chars in name are quoted", () => {
    const prompt = makePrompt("Hello: World", "hello-world");
    const version = makeVersion(1, "x", null);
    const out = renderVersionContent(prompt, version);
    expect(out).toContain('prompt_name: "Hello: World"');
  });

  test("null commit_message omits the line", () => {
    const prompt = makePrompt("Plain", "plain");
    const version = makeVersion(1, "x", null);
    const out = renderVersionContent(prompt, version);
    expect(out).not.toContain("commit_message:");
  });

  test("multi-line content is preserved verbatim below frontmatter", () => {
    const prompt = makePrompt("Plain", "plain");
    const body = "line one\nline two\n\nline four";
    const version = makeVersion(1, body, null);
    const out = renderVersionContent(prompt, version);
    expect(out.endsWith(`${body}\n`)).toBe(true);
  });

  test("content already ending with newline is not double-padded", () => {
    const prompt = makePrompt("Plain", "plain");
    const version = makeVersion(1, "ends with newline\n", null);
    const out = renderVersionContent(prompt, version);
    expect(out.endsWith("ends with newline\n")).toBe(true);
    expect(out.endsWith("ends with newline\n\n")).toBe(false);
  });

  test("backslash and double-quote in name are escaped inside the quoted scalar", () => {
    const prompt = makePrompt('a"b\\c', "ab-c");
    const version = makeVersion(1, "x", null);
    const out = renderVersionContent(prompt, version);
    expect(out).toContain('prompt_name: "a\\"b\\\\c"');
  });

  test("renderVersionContentRaw matches renderVersionContent for the same inputs", () => {
    const prompt = makePrompt("Hello: World", "hello-world");
    const version = makeVersion(2, "body\n", "msg");
    const fromEntity = renderVersionContent(prompt, version);
    const fromRaw = renderVersionContentRaw(
      "Hello: World",
      "hello-world",
      version,
    );
    expect(fromRaw).toBe(fromEntity);
  });
});
