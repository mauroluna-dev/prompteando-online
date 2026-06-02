import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { makeExportHandler } from "@/interfaces/http/handlers/export.handler";
import type { GetCurrentUserQuery } from "@/application/queries/get-current-user.query";
import type { ExportAllPromptsQuery } from "@/application/queries/export-all-prompts.query";
import { ZipBundleWriter } from "@/infrastructure/export/zip-bundle-writer.adapter";
import type { ExportBundle } from "@/application/queries/export-bundle.dto";

function fakeCurrentUser(user: { id: string } | null): GetCurrentUserQuery {
  return { execute: async () => user } as unknown as GetCurrentUserQuery;
}

function fakeExport(bundle: ExportBundle): ExportAllPromptsQuery {
  return { execute: async () => bundle } as unknown as ExportAllPromptsQuery;
}

function emptyBundle(userId: string): ExportBundle {
  return {
    generatedAt: new Date("2026-05-04T12:00:00Z"),
    user: { id: userId },
    prompts: [],
  };
}

describe("GET /api/export.zip handler", () => {
  test("returns 401 when there is no session", async () => {
    const handler = makeExportHandler({
      getCurrentUser: fakeCurrentUser(null),
      exportAllPrompts: fakeExport(emptyBundle("u1")),
      zipWriter: new ZipBundleWriter(),
    });
    const res = await handler(new Request("http://localhost/api/export.zip"));
    expect(res.status).toBe(401);
  });

  test("streams a valid ZIP with the right headers for an authed user", async () => {
    const handler = makeExportHandler({
      getCurrentUser: fakeCurrentUser({ id: "u1" }),
      exportAllPrompts: fakeExport(emptyBundle("u1")),
      zipWriter: new ZipBundleWriter(),
    });
    const res = await handler(new Request("http://localhost/api/export.zip"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="prompteando-export-2026-05-04.zip"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");

    const bytes = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(bytes);
    expect(new Set(Object.keys(files))).toEqual(
      new Set(["README.md", "index.json"]),
    );
    const indexBytes = files["index.json"];
    expect(indexBytes).toBeDefined();
    const index = JSON.parse(new TextDecoder().decode(indexBytes));
    expect(index.prompts).toEqual([]);
  });
});
