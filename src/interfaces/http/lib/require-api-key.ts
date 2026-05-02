import type { AuthenticateApiKeyQuery } from "@/application/queries/authenticate-api-key";
import type { ApiKey } from "@/domain/api-key";
import {
  InvalidApiKeyError,
  MissingAuthorizationHeaderError,
} from "@/domain/api-key";

const UNIFIED_401_BODY = JSON.stringify({ error: "Invalid API key" });
const HEADERS = {
  "content-type": "application/json",
  "www-authenticate": "Bearer",
};

/**
 * Public-API auth helper. Returns the authenticated ApiKey or a
 * 401 Response with a unified body — never leaks why auth failed.
 */
export async function requireApiKey(
  request: Request,
  authenticate: AuthenticateApiKeyQuery,
  extraHeaders: Record<string, string> = {},
): Promise<ApiKey | Response> {
  try {
    return await authenticate.execute(request.headers.get("authorization"));
  } catch (err) {
    if (
      err instanceof MissingAuthorizationHeaderError ||
      err instanceof InvalidApiKeyError
    ) {
      return new Response(UNIFIED_401_BODY, {
        status: 401,
        headers: { ...HEADERS, ...extraHeaders },
      });
    }
    throw err;
  }
}
