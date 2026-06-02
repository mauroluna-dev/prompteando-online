import type { GetCurrentUserQuery } from "@/application/queries/get-current-user.query";
import type { ExportAllPromptsQuery } from "@/application/queries/export-all-prompts.query";
import type { ZipBundleWriter } from "@/infrastructure/export/zip-bundle-writer.adapter";
import { CONSTANTS } from "@/infrastructure/export/constants";
import { requireUser } from "../lib/require-user";

type ExportHandlerDeps = {
  getCurrentUser: GetCurrentUserQuery;
  exportAllPrompts: ExportAllPromptsQuery;
  zipWriter: ZipBundleWriter;
};

/**
 * `GET /api/export.zip` — session-authenticated full data dump.
 *
 * Streams the user's prompts + version history as a ZIP. Not reachable
 * via API key on purpose: this is the human owner's export, not a
 * programmatic consumer endpoint.
 */
export function makeExportHandler(deps: ExportHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    const userOr401 = await requireUser(request, deps.getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    const bundle = await deps.exportAllPrompts.execute(userOr401.id);
    const stream = deps.zipWriter.toReadableStream(bundle);
    const filename = `${CONSTANTS.FILENAME_PREFIX}${formatDay(bundle.generatedAt)}.zip`;

    return new Response(stream, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  };
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}
