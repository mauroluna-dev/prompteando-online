import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import type { ExportBundle } from "@/application/queries/export-bundle.dto";
import { ZipBundleWriter } from "@/infrastructure/export/zip-bundle-writer.adapter";

const GENERATED_AT = new Date("2026-05-04T12:00:00Z");

function makeBundle(overrides?: Partial<ExportBundle>): ExportBundle {
  return {
    generatedAt: GENERATED_AT,
    user: { id: "u1" },
    prompts: [
      {
        id: "p1",
        slug: "welcome-email",
        name: "Welcome email",
        description: "greeting",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-02-01T00:00:00Z"),
        currentVersionNumber: 2,
        versions: [
          {
            versionNumber: 1,
            content: "Hello",
            commitMessage: "init",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            githubCommitSha: null,
          },
          {
            versionNumber: 2,
            content: "Hello there",
            commitMessage: "shorter",
            createdAt: new Date("2026-02-01T00:00:00Z"),
            githubCommitSha: "abc123",
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function zipBytes(bundle: ExportBundle): Promise<Uint8Array> {
  return drain(new ZipBundleWriter().toReadableStream(bundle));
}

function unzip(bytes: Uint8Array): Record<string, string> {
  const decoder = new TextDecoder();
  const files = unzipSync(bytes);
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    out[path] = decoder.decode(content);
  }
  return out;
}

describe("ZipBundleWriter", () => {
  test("produces byte-identical archives for the same bundle (determinism)", async () => {
    const bundle = makeBundle();
    const a = await zipBytes(bundle);
    const b = await zipBytes(bundle);
    expect(a).toEqual(b);
  });

  test("contains README, index.json and one markdown file per version", async () => {
    const files = unzip(await zipBytes(makeBundle()));
    expect(new Set(Object.keys(files))).toEqual(
      new Set([
        "README.md",
        "index.json",
        "prompts/welcome-email/v1.md",
        "prompts/welcome-email/v2.md",
      ]),
    );
    expect(files["prompts/welcome-email/v1.md"]).toBe("Hello");
    expect(files["prompts/welcome-email/v2.md"]).toBe("Hello there");
  });

  test("index.json round-trips the bundle (dates as ISO strings)", async () => {
    const bundle = makeBundle();
    const files = unzip(await zipBytes(bundle));
    const parsed = JSON.parse(files["index.json"] as string);
    expect(parsed).toEqual(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.generatedAt).toBe(GENERATED_AT.toISOString());
  });

  test("README mentions prompteando", async () => {
    const files = unzip(await zipBytes(makeBundle()));
    expect(files["README.md"]).toContain("prompteando");
  });

  test("empty bundle yields only README + index.json with prompts: []", async () => {
    const files = unzip(
      await zipBytes(makeBundle({ prompts: [] })),
    );
    expect(new Set(Object.keys(files))).toEqual(
      new Set(["README.md", "index.json"]),
    );
    expect(JSON.parse(files["index.json"] as string).prompts).toEqual([]);
  });

  test("defends against slug collisions with an id-suffixed directory", async () => {
    const bundle = makeBundle({
      prompts: [
        {
          id: "aaaaaaaa-1111",
          slug: "dup",
          name: "First",
          description: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
          currentVersionNumber: 1,
          versions: [
            {
              versionNumber: 1,
              content: "first",
              commitMessage: null,
              createdAt: new Date("2026-01-01T00:00:00Z"),
              githubCommitSha: null,
            },
          ],
        },
        {
          id: "bbbbbbbb-2222",
          slug: "dup",
          name: "Second",
          description: null,
          createdAt: new Date("2026-01-02T00:00:00Z"),
          updatedAt: new Date("2026-01-02T00:00:00Z"),
          currentVersionNumber: 1,
          versions: [
            {
              versionNumber: 1,
              content: "second",
              commitMessage: null,
              createdAt: new Date("2026-01-02T00:00:00Z"),
              githubCommitSha: null,
            },
          ],
        },
      ],
    });
    const paths = Object.keys(unzip(await zipBytes(bundle)));
    expect(paths).toContain("prompts/dup/v1.md");
    expect(paths).toContain("prompts/dup-bbbbbbbb/v1.md");
  });

  test("every entry's mtime is pinned to the 1980 ZIP epoch", async () => {
    const bytes = await zipBytes(makeBundle());
    // First local file header sits at offset 0:
    //   0-3 signature (PK\x03\x04), 10-11 mod time, 12-13 mod date.
    // DOS date for 1980-01-01 = (0<<9)|(1<<5)|1 = 0x0021; time 00:00 = 0.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // PK\x03\x04
    expect(view.getUint16(10, true)).toBe(0); // time = 00:00:00
    expect(view.getUint16(12, true)).toBe(0x0021); // date = 1980-01-01
  });
});
